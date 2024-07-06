const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const fs = require('fs') ;
const url = require("url") ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/scanToSuppressUsingNSWF',		  async (req, res) => { scanToSuppressUsingNSWF(req, res) }) ;
  router.get('/scanToSuppressUsingKeywords',  async (req, res) => { scanToSuppressUsingKeywords(req, res) }) ;
  router.get('/scanToSuppressUsingLLM',       async (req, res) => { scanToSuppressUsingLLM(req, res) }) ;
  router.get('/generateDescriptionAndnswfUsingMsVision',       async (req, res) => { generateDescriptionAndnswfUsingMsVision(req, res) }) ;
  return router ;  
}

// id: {"http://nla.gov.au/nla.obj-002652196/image" TO "z"] 

function genImageSrc(id) {
  let im = id.replace('https://nla.gov.au', 'https://localhost:' + appConfig.port + '/static/pics')
          .replace('http://nla.gov.au', 'https://localhost:' + appConfig.port + '/static/pics')
          .replace("/image", ".jpg")
          .replace("/representativeImage", ".jpg") ;
  // something like   /static/pics/nla.obj-161515917.jpg
  let i = im.indexOf('/nla.obj-') ;
  let j = im.indexOf('.jpg') ;
  let idd = Number(im.substring(i+9, j)) ;
  let subDir = idd % 1000 ;
  return im.substring(0, i) + "/" + subDir + im.substring(i) ;

}


const VISION_SCAN_CHECKPOINT_FILENAME = "visionScanCheckpoint.data" ;

async function generateDescriptionAndnswfUsingMsVision(req, res) {

  let count = 0 ;
  let suppressed = 0 ;
  let newlySuppressed = 0 ;

  try {

    // try using the MicrosoftVision model to describe images and identify images which might be sus based on their metadata

    let lastId = "" ;
    if (fs.existsSync(VISION_SCAN_CHECKPOINT_FILENAME)) 
      lastId = fs.readFileSync(VISION_SCAN_CHECKPOINT_FILENAME) ;

    if (!lastId) lastId = 'a' ;
    //lastId = 'a' ; // DEBUG
    res.write("generateDescriptionAndnswfUsingMsVision starting from id: " + lastId + "\n") ;
    console.log("generateDescriptionAndnswfUsingMsVision starting from id: " + lastId + "\n") ;

    let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
   // "?wt=json&rows=999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id:\"http://nla.gov.au/nla.obj-130766338/image\"") ;  // DEBUG

       "?wt=json&rows=999999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id: {\"" + lastId + "\" TO \"z\"]") ; 

    if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
      res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
      if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
      res.end() ;
      return ;
    }
    res.write(" Found: " + solrRes.data.response.numFound + "\n") ;

    let docs = solrRes.data.response.docs ;
    for (let doc of docs) {

      res.write(" visionDesc on " + doc.id + "\n") ;
      console.log(" visionDesc on " + doc.id + "\n") ;

      let localCopyUrl = genImageSrc(doc.url) ;
      let  msVisionResp = await getVisionDescriptionAndJudgement(localCopyUrl) ;
    //  res.write("msVisionResp:" + msVisionResp + "//\n") ;

      if (msVisionResp.description) {

     //   console.log("about to get embedding..") ;
        let clipEmbedding = await util.getEmbedding(msVisionResp.description) ;
       // console.log("got embedding") ;

        let updatedFields = {
          msVisionDescription: msVisionResp.description,
          msVisionDescriptionVector: setEmbeddingsAsFloats(clipEmbedding)
        }
        if (msVisionResp.nsfw == "NSFW") {
          suppressed++ ;
          console.log(" msVisionResp.nsfw =" + msVisionResp.nsfw  + " doc.suppressed " + doc.suppressed  + " doc.manuallyForcedUnsuppressed " + doc.manuallyForcedUnsuppressed) ;
          if (!doc.suppressed && !doc.manuallyForcedUnsuppressed) {
            updatedFields.suppressed = 'V' ; // vision!
            newlySuppressed++ ;
          }
        }
        res.write("updating " + doc.id ) ;
        updateDoc(doc.id, updatedFields) ;
      }
      else res.write("no description generated for image") ;


      count++ ;
      if ((count % 100) == 0) {
        res.write("checkpointing count " + suppressed + "/" + count + " newly sppressed: " + newlySuppressed + " id " + doc.id) ;
        console.log("checkpointing count " + suppressed + "/" + count + " newly sppressed: " + newlySuppressed + " id " + doc.id) ;
        fs.writeFileSync(VISION_SCAN_CHECKPOINT_FILENAME, doc.id) ;
        //break ;// DEBUG
      }
      // if (count >= 101) break ;
    }

    //appConfig.llmUrl
  }
  catch (e) {
    console.log("generateDescriptionAndnswfUsingMsVision err " + e) ;
    res.write("generateDescriptionAndnswfUsingMsVision err " + e) ;
    console.log(e.stack) ;
  }
  res.write("\ncount: " + count + " suppressed count:" + suppressed + " newly sppressed: " + newlySuppressed + "\n") ;
  console.log("\generateDescriptionAndnswfUsingMsVision count: " + count + " suppressed count:" + suppressed + " newly sppressed: " + newlySuppressed  + "\n") ;
  res.end() ;
}

function setEmbeddingsAsFloats(rawEmbedding) { // fixes a problem where embedding has to much precision and blows up SOLR
 
  for (let k=0;k<rawEmbedding.length;k++)rawEmbedding[k] = Number(rawEmbedding[k]).toFixed(8) ;
  return rawEmbedding ;
}


async function getVisionDescriptionAndJudgement(imageUrl) { 



  console.log("off to vision with " + appConfig.visionUrl  + "?imageUrl=" + imageUrl) ;

  try {
    let eRes = await axios.get(appConfig.visionUrl  + "?imageUrl=" + imageUrl, // params,   
      {         
        headers: {'Content-Type': 'application/json'}
      }  
    ) ;
    //console.log("back from get sum") ;
    if (!eRes.status == 200) throw "Cant getVisionDescriptionAndJudgement, server returned http resp " + eRes.status ;

   if (!eRes.data || !eRes.data) throw "Cant getLLMjudgement, server returned no data" ;
   console.log("getVisionDescriptionAndJudgement ret " + JSON.stringify(eRes.data)) ;
   return eRes.data ;
  }
  catch (e) {
    console.log("Error in getVisionDescriptionAndJudgement: " +e) ;
    return null ;
  }
}



const LLM_SCAN_CHECKPOINT_FILENAME = "llmScanCheckpoint.data" ;

async function scanToSuppressUsingLLM(req, res) {

  let count = 0 ;
  let suppressed = 0 ;
  try {

    // try using the LLM to identify images which might be sus based on their metadata

    let lastId = "" ;
    if (fs.existsSync(LLM_SCAN_CHECKPOINT_FILENAME)) 
      lastId = fs.readFileSync(LLM_SCAN_CHECKPOINT_FILENAME) ;

    if (!lastId) lastId = 'a' ;
    //lastId = 'a' ; // DEBUG
    res.write("scanToSuppressUsingLLM starting from id: " + lastId + "\n") ;
    console.log("scanToSuppressUsingLLM starting from id: " + lastId + "\n") ;

    let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
      "?wt=json&rows=999999&fq=-suppressed:* AND -manuallyForcedUnsuppressed:*&fl=id,title,metadataText&sort=id asc&q=id: {\"" + lastId + "\" TO \"z\"]") ; // DEBUG

    if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
      res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
      if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
      res.end() ;
      return ;
    }
    res.write(" Found: " + solrRes.data.response.numFound + "\n") ;

    let docs = solrRes.data.response.docs ;
    for (let doc of docs) {
      let md = doc.metadataText ;
      if (!md) {  // very odd..
        res.write(" No metadataText for id " + doc.id + " title " + doc.title + "\n") ;
        continue ;        
      }

      let txt = md.join(" ").replaceAll(" -- ", ", ").replaceAll(" :", ":").replace(/\s\s+/g, " ") ;
      res.write(" LLM on " + doc.id + " with text: " + txt + "\n") ;

      let judgement = await getLLMjudgement(txt) ;
      res.write("judgement:" + judgement + "//\n") ;
      if (judgement != "OK") {
        res.write(" ======NOT OK!!!!\n") ;
        await setSuppressed(doc.id, "L") ;
        suppressed++ ;
      }

      count++ ;
      if ((count % 100) == 0) {
        res.write("checkpointing count " + suppressed + "/" + count + " id " + doc.id) ;
        console.log("checkpointing count " + suppressed + "/" + count + " id " + doc.id) ;
        fs.writeFileSync(LLM_SCAN_CHECKPOINT_FILENAME, doc.id) ;
      }
      //if (count >= 1000) break ;
    }

    //appConfig.llmUrl
  }
  catch (e) {
    console.log("scanToSuppressUsingLLM err " + e) ;
    res.write("scanToSuppressUsingLLM err " + e) ;
    e.stack ;
  }
  res.write("\ncount: " + count + " suppressed count:" + suppressed + "\n") ;
  console.log("\nscanToSuppressUsingLLM count: " + count + " suppressed count:" + suppressed + "\n") ;
  res.end() ;
}

async function getLLMjudgement(metadata) { 

  let promptInstructions = "Assistant is an intelligent agent that processes descriptive metadata of collection items " +
    "managed by user, who works for a risk-adverse museum.  User wants to know if the descriptive metadata for a collection " +
    "item may be culturally sensitive or offensive to some people, in which case they will label it as 'NSFW'. " +
    "The user needs to be warned about content " +
    "that may be racist, as well as nudity, drug use or other not safe for work (NSFW) content. " +
    "Content, especially older content about indigenous and aboriginal people is likely to be NSFW. " +
   // "potentially racist content, as well as nudity, drug use or other not safe for work content. " +
    "The user supplies the descriptive metadata, the agent replies NSFW if possibly sensitive, or replies OK if unlikely to offend." ;

 
  try {
    let prompt = "<|im_start|>system\n" +
        promptInstructions +
        "<|im_end|>\n" +
        "<|im_start|>user\n " +
        metadata +
        " <|im_end|>\n" +
        "<|im_start|>assistant\n" ;
    let startResponseMarker = "<|im_start|>assistant" ;              

    //console.log("\n=================Summary prompt: " + prompt) ;

    let data = {
          "prompt": prompt,
          "use_beam_search": false,              
          "temperature":0.0,
          "n":1,
          "max_tokens": 20,
          "stream":false,
          skip_special_tokens: false,                         // skip and stop are attempts to stop startling model from seeming to loop
          stop: ["<|im_end|>"]                                  // open-hermes-neural-chat blend emits this
    } ;

    let eRes = await axios.post(appConfig.llmUrl, 
      data,
      { headers: {'Content-Type': 'application/json'}
      }  
    ) ;
    //console.log("back from get sum") ;
    if (!eRes.status == 200) throw "Cant getLLMjudgement, server returned http resp " + eRes.status ;

   if (!eRes.data || !eRes.data.text) throw "Cant getLLMjudgement, server returned no data" ;
   let r = eRes.data.text[0] ;
   if (startResponseMarker) {
     let rs = r.indexOf(startResponseMarker) ;
     if (rs >= 0) r = r.substring(rs + startResponseMarker.length) ;
   }
   let ri = r.indexOf("[ANSWER STARTS]") ;
   if (ri >= 0) r = r.substring(ri+15).trim() ;
       
   r = r.replaceAll("</s>", "").replaceAll("[ANSWER ENDS]", "") ;

   r = r.replace(/\bThe user\b/g, "The speaker").replace(/\bthe user\b/g, "the speaker")  // one model is doing this..
        .replace(/<\/|im_end|>/g, "") ; 

   let i = r.indexOf("<") ; // phi-3 small sometimes emits < and extra stuff... just chuck it away
   if (i > 32) r = r.substring(0, i) ;

   //console.log("\n========== ======= ==== Returned summary: " + r) ;
   return r.trim() ;
  }
  catch (e) {
    console.log("Error in getLLMjudgement: " +e) ;
    return null ;
  }
}



async function scanToSuppressUsingKeywords(req, res) {

  let suppressed = 0 ;

  let suppressList = [
    '"drug user"', '"drug injection"',  '"drug abuse"',
    '"wild native"',
    "heroin", "cocaine",
     "brothel", "fetish", "nudity", "lubra", "nigger", "indigenous ceremony", "aboriginal ceremony", "aboriginal hunting", "aboriginal prisoner"
  ]

  res.write("Running scanToSuppressUsingKeywords\n") ;
  try {

    for (t of suppressList) {

     // find images with text

     console.log("text:" + t) ;
     let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
       "?wt=json&rows=999999&fq=-suppressed:* AND -manuallyForcedUnsuppressed:*&fl=id,url,title&q.op=AND&q=metadataTextStemmed:(" + t + ")") ;

     res.write("text: " + t) ;
     if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
       res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
       if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
       continue ;
     }
     res.write(" Found: " + solrRes.data.response.numFound + "\n") ;
 
     let docs = solrRes.data.response.docs ;
     for (let doc of docs) {
       suppressed++ ;
       res.write(" suppressing url: " + doc.url + "  title: " + doc.title + "\n") ;
       await setSuppressed(doc.id, "K") ;
     }
    }
  }
  catch (e) {
    console.log("scanToSuppressUsingKeywords err " + e) ;
    res.write("scanToSuppressUsingKeywords err " + e) ;
  }
  res.write("\nsuppressed count:" + suppressed + "\n") ;
  res.end() ;

}

async function scanToSuppressUsingNSWF(req, res) {

  let scanned = 0 ;
  let sfw = 0 ;
  let nsfw = 0 ;
  let threshold = 0.8 ;

  res.write("Running scanToSuppressUsingNSWF using threshold " + threshold + " against " + appConfig.nsfwUrl + "\n") ;

  let solrRes = null ;
  try {
    res.write("req: " + appConfig.solr.getSolrBaseUrl() + "pictures/select?wt=json&rows=99&q=*:*&fq=-suppressed:y&fl=url,title")

   // http://hinton.nla.gov.au:8983/solr/pictures/select?fq=-suppressed%3Ay&indent=true&q.op=OR&q=*%3A*&useParams=
     //   eq: http://127.0.0.1:8983/solr/pictures/select?wt=json&rows=99&q=*:*&fq=-suppressed:y&fl=url,title

    // find unsuppressed images
    solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
      "?wt=json&rows=999999&q=*:*&fq=-suppressed:* AND -manuallyForcedUnsuppressed:*&fl=id,url,title") ;
    if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
      res.write("Failed to find any records, status: " + solrRes.status + "\n") ;
      if (solrRes.data) res.write("Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
      res.end() ;
      return ;
    }
    res.write("Found: " + solrRes.data.response.numFound + "\n") ;

    let docs = solrRes.data.response.docs ;
    for (let doc of docs) {
      
      let localCopyUrl = genImageSrc(doc.url) ;

 
      scanned++ ;
      let nsfwResp = await axios.get(appConfig.nsfwUrl, 
        {data : {imageUrl:localCopyUrl}}
      ) ;
     // console.log("nsfwResp:" + nsfwResp) ;
      if (nsfwResp.status != 200) {
        res.write(" Failed to get nsfwResp on url: " + doc.url + " | " + localCopyUrl + " status: " + nsfwResp.status + "\n") ;
        res.end() ;
        return ;
      }
      nsfwScore = nsfwResp.data.nsfwScore ;
      if (nsfwScore > threshold) {
        res.write(" url: " + doc.url + "  title: " + doc.title + " NSFW score:" + nsfwScore.toFixed(4)  + "\n") ;
        nsfw++ ;
        await setSuppressed(doc.id, "I") ;
        res.write("AWESOME updated " + doc.id) ;
      }
      else {
        //res.write(" OK score:" + nsfwScore.toFixed(4)  + "\n") ;
        sfw++ ;
      }
    }
    res.write("\nscanned: " + scanned + " sfw: " + sfw + " nsfw: " + nsfw) ;    
  }
  catch (e) {
    console.log("scanToSuppressUsingNSWF err " + e) ;
    res.write("scanToSuppressUsingNSWF err " + e) ;
  }
  res.end() ;
}

async function updateDoc(id, updatedFields) {

  try {
    let selectData = 
      "wt=json&rows=1" +
      "&q=id:\"" + encodeURIComponent(id) + "\"" +
      "&fl=*" ;

    let solrRes = null ;

    solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "pictures/select?" + selectData) ;

    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR updateDoc id " + id + " unexpected response: " + solrRes.status + " or nothing found" ;

    let doc = solrRes.data.response.docs[0] ;

    for (let fldName in updatedFields) {
        let val = updatedFields[fldName] ;
        if (val === null) delete doc[fldName] ;
        else doc[fldName] = updatedFields[fldName] ;
    }
    
    delete doc["_version_"] ;  // update/replace wont work with this!

    console.log("about to update doc with id:" + id) ;
    await solr.addOrReplaceDocuments(doc, "pictures") ;  // unique key is id
    console.log("picture updateDoc done") ;
  }
  catch (e) {
    console.log("error in updateDoc, id:" + id + ", err:" + e) ;
    e.stack ;
    throw e ;
  }

}


async function setSuppressed(id, suppressedFlag) {

  await updateDoc(id, {suppressed: suppressedFlag}) ;
  /*
  try {
    let selectData = 
      "wt=json&rows=1" +
      "&q=id:\"" + encodeURIComponent(id) + "\"" +
      "&fl=*" ;

    let solrRes = null ;

    solrRes = await axios.get(
        appConfig.solr.getSolrBaseUrl() + "pictures/select?" + selectData) ;


    if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs))
      throw "SOLR setSuppressed id " + id + " unexpected response: " + solrRes.status + " or nothing found" ;

    let doc = solrRes.data.response.docs[0] ;
    
    if (suppressedFlag) doc.suppressed = suppressedFlag ;
    else delete doc["suppressed"] ;


    delete doc["_version_"] ;  // update/replace wont work with this!

    console.log("about to update doc with suppressed id:" + id) ;
    await solr.addOrReplaceDocuments(doc, "pictures") ;  // unique key is id
    console.log("picture suppressed update done") ;
  }
  catch (e) {
    console.log("error in setSuppressed, id:" + id + ", err:" + e) ;
    e.stack ;
    throw e ;
  }
    */
}
module.exports.init = init ;