const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;
const fs = require('fs') ;
const url = require("url") ;
const { OpenAI } = require('openai');



let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/scanToSuppressUsingNSWF',		  async (req, res) => { scanToSuppressUsingNSWF(req, res) }) ;
  router.get('/scanToSuppressUsingKeywords',  async (req, res) => { scanToSuppressUsingKeywords(req, res) }) ;
  router.get('/scanToSuppressUsingLLM',       async (req, res) => { scanToSuppressUsingLLM(req, res) }) ;
  router.get('/comparePhi30And35Descriptions',async (req, res) => { comparePhi30And35Descriptions(req, res) }) ;  
  router.get('/generateDescriptionAndnswfUsingMsVision',       async (req, res) => { generateDescriptionAndnswfUsingMsVision(req, res) }) ;
  router.get('/generatePhi35DescriptionForOAimageDescriptions',async (req, res) => { generatePhi35DescriptionForOAimageDescriptions(req, res) }) ; 
  router.get('/checkCopyrightByBibidForOpenAIImages',          async (req, res) => { checkCopyrightByBibidForOpenAIImages(req, res) }) ;
  router.get('/findExtraImagesForEvaluationSet',               async (req, res) => { findExtraImagesForEvaluationSet(req, res) }) ; 
  router.get('/addOpenAIDescriptions',       async (req, res) => { addOpenAIDescriptions(req, res) }) ; 
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

async function comparePhi30And35Descriptions(req, res) {

  let count = 0 ;
  let phi30Sim = 0 ;
  let phi35Sim = 0 ;
  let phiPhiSim = 0 ; 

  try {

    let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
   // "?wt=json&rows=999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id:\"http://nla.gov.au/nla.obj-130766338/image\"") ;  // DEBUG


       "?wt=json&rows=999999&fl=id,openaiDescriptionVector,msVisionDescriptionVector,msVision35DescriptionVector&sort=id asc&q=msVision35Description:* AND -suppressed:*") ; 
    if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
      res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
      if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
      res.end() ;
      return ;
    }
    res.write(" Found: " + solrRes.data.response.numFound + "\n") ;

    let docs = solrRes.data.response.docs ;
    for (let doc of docs) {
      let p3s = util.innerProduct(doc.openaiDescriptionVector, doc.msVisionDescriptionVector) ;
      let p35s = util.innerProduct(doc.openaiDescriptionVector, doc.msVision35DescriptionVector) ;
      let pps = util.innerProduct(doc.msVision35DescriptionVector, doc.msVisionDescriptionVector) ;
      res.write(" visionDesc on " + doc.id + " p3s " + p3s + " p35s " + p35s + " pps " + pps + "\n") ;
      phi30Sim += p3s ;
      phi35Sim += p35s ;
      phiPhiSim += pps ;
      count++ ;
    }

  }
  catch (e) {
      console.log("comparePhi30And35Descriptions err " + e) ;
      res.write("comparePhi30And35Descriptions err " + e) ;
      console.log(e.stack) ;
  }
  res.write("\ncount: " + count + " phi30Sim av:" + (phi30Sim / count) + " phi35Sim av:" + (phi35Sim / count) +  " phiPhiSim av:" + (phiPhiSim / count) + "\n") ;
  res.end() ;
}

async function addOpenAIDescriptions(req, res) {

  /* find everything with "processingStatus":"pending openAI description"
      - it may already have an openai description - I made a mistake not setting this flag on them, so if found,
        remove processingStatus and ignore
      - it may be missed copyright: "Out of Copyright" - again, my mistake as we know this is the copyright status, 
        so remember to add it
      - get description from openAI, passing the title, exactly as Francis did, and update, removing processingStatus field
         (and adding copyright if I forgot it!)
   */

   let apiKey = req.query.apiKey ;

   const openai = new OpenAI({
    apiKey: apiKey
  });



   let count = 0 ;
   let alreadyGotDesc = 0 ;
   let descAdded = 0 ;
   let errors = 0 ;

   let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
     "?wt=json&rows=9999&fl=id,url,title,bibId,processingStatus,openAIDescription,copyright" +
     "&q=processingStatus:\"pending openAI description\"") ;
 
    if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
      res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
      if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
      res.end() ;
      return ;
    }
    res.write(" Found: " + solrRes.data.response.numFound + "\n") ;

    let docs = solrRes.data.response.docs ;
    for (let doc of docs) {
      count++ ;
      console.log("got doc " + count + " id: " + doc.id + " title " + doc.title) ;
      if (doc.openAIDescription) {
        alreadyGotDesc++ ;
        res.write("doc " + doc.id + " already have description\n") ;
        let updatedFields = {
          processingStatus: null
        } ;
        await updateDoc(doc.id, updatedFields) ;
        continue ;
      }

      let instructions = "Please describe this image." ;
      if (doc.title) instructions += " For reference, this is the title of the image: " + doc.title.replace("[picture]", "") ;
          
      let openAIDescription = null ;
      try {
      const completion = await openai.chat.completions.create({
        model:"gpt-4o",
        messages:[
          {"role": "user", "content": [
              {"type": "text", "text": instructions},
              {"type": "image_url", "image_url": {"url": doc.id + "?WID=1024"}},
          ]
          }
        ],
        max_tokens:1000}) ;

        console.log("COMPLETION " + JSON.stringify(completion)) ;

        openAIDescription =  completion.choices[0].message.content ;
      }
      catch (oe) {

        res.write("openAIDescription Error " + oe + "\n") ;
        console.log("openAIDescription Error " + oe) ;
        console.log(oe.stack) ;
      }
      

      res.write("doc " + doc.id + " openAIDescription: " + openAIDescription + "\n") ;

      if (!openAIDescription) { // error...
        let updatedFields = {
          processingStatus: "error getting openAIdescr"
        } ;
        if (!doc.copyright) // fix bug
         updatedFields.copyright = "Out of Copyright" ;
         await updateDoc(doc.id, updatedFields) ;
         errors++ ;
         continue ;
      }
      let openaiDescriptionVector = await util.getEmbedding(openAIDescription) ;
      // console.log("got embedding") ;

       let updatedFields = {
         processingStatus: null,
         openAIDescription: openAIDescription,
         openaiDescriptionVector: setEmbeddingsAsFloats(openaiDescriptionVector)
       } ;
       if (!doc.copyright) // fix bug
        updatedFields.copyright = "Out of Copyright" ;

       await updateDoc(doc.id, updatedFields) ;
       descAdded++ ;  
             
      }

      res.write("\n done count " + count + " alreadyGotDesc " + alreadyGotDesc + " descAdded " + descAdded + " errors " + errors) ;
      console.log("\n done count " + count + " alreadyGotDesc " + alreadyGotDesc + " descAdded " + descAdded + " errors " + errors) ;

}

async function findExtraImagesForEvaluationSet(req,res) {

  // Francis initially found 5000 images and got openAI generated descriptions for most of them.  This was about enough
  // for an image search evaluation for his presentation at NFSA, but then things got wierd...
  // We removed (suppressed) NSFW and ICIP images as best we could (a few hundred images removed from the set).
  // Then someone for some reason thought we shouldnt have any copyrighted images in the set, even though the evaluation
  // was internal to NLA.  This removed about half..
  // SO, this process is to find about 3500 images that we havent yet asked openAI about, and that are not in
  // copyright (according to the copyright tool) and of course, not suppressed.

  // first, find images on blacklight from possible decades (before the 1950s should be mostly safe, but who knows..)


  let blacklightRes = await axios.get("http://trv-solr-tst-1.nla.gov.au:10002/solr/blacklight/select?" + 
    "wt=json&rows=9999&fl=id%2Ctitle_tsim%2Cthumbnail_path_ss" +
    "&q.op=AND&q=format%3APicture%20AND%20(decade_isim%3A%5B1870%20TO%201940%5D)%20AND%20" +
        "-decade_isim%3A1950%20AND%20-decade_isim%3A1960%20AND%20" +
        "access_ssim%3A%22National%20Library%20(digitised%20item)%22") ;

  if (!((blacklightRes.status == 200) && blacklightRes.data &&  blacklightRes.data.response)) {
    res.write(" Failed to find any blacklightRes records, status: " + blacklightRes.status + "\n") ;
    if (blacklightRes.data) res.write(" Solr data: " + JSON.stringify(blacklightRes.data) + "\n") ;
    res.end() ;
    return ;
  }
  res.write(" Found: " + blacklightRes.data.response.numFound + "\n") ;

  let blacklightDocs = blacklightRes.data.response.docs ;

  let blCount = 0 ;
  let notFound = 0 ;
  let alreadySuppressed = 0 ;
  let badCopyright = 0 ;
  let acceptedCount = 0 ;

  for (let blDoc of blacklightDocs) {
    blCount++ ;
    console.log("blCount " + blCount + " blDoc: " + JSON.stringify(blDoc)) ;
    let c = await getCopyightStatus(res, blDoc.id) ;
    console.log("  bib " + blDoc.id + " copyright status: " + c) ;
    if (c != "Out of Copyright") {
      badCopyright++ ;
      continue ;
    }

    // check we have doc, that it doesnt already have an openAI desc, and that it isnt suppressed

    let solrRes = null ;
    try {
      let selectData = 
        "wt=json&rows=1" +
        "&q=bibId:\"" + encodeURIComponent(blDoc.id) + "\"" +
        "&fl=id,suppressed,bibId" ;  // darn, forgot to get openAIDescription and check it didnt exist...

      let solrRes = null ;

      solrRes = await axios.get(
          appConfig.solr.getSolrBaseUrl() + "pictures/select?" + selectData) ;

      if ((solrRes.status != 200) || !(solrRes.data && solrRes.data.response && solrRes.data.response.docs) || 
          (solrRes.data.response.docs.length != 1)) {
        console.log("doc not found or unexpected response " + solrRes.status) ;
        notFound++ ;
        continue ;
      }

      let doc = solrRes.data.response.docs[0] ;
      if (doc.suppressed) {
        console.log("sadly, doc already suppressed in picture index " + doc.suppresed) ;
        alreadySuppressed++ ;
        continue ;
      }

      // ok - we keep this one   DARN!! should have updated copyright: "Out of Copyright" - do this later!!
 
      let updatedFields = {
        processingStatus: "pending openAI description" 
      }

      //res.write("updating " + doc.id ) ;
      await updateDoc(doc.id, updatedFields) ;
      if (acceptedCount++ >= 3500) break ;
    }
    catch (e) {
      console.log("Error in findExtraImagesForEvaluationSet " + e) ;
      throw e ;
    }
  }

  res.write("\nblCount " + blCount + " notFound " + notFound + " alreadySuppressed " + alreadySuppressed +
              " badCopyright " + badCopyright + " acceptedCount " + acceptedCount) ;
  res.end() ;
  console.log("blCount " + blCount + " notFound " + notFound + " alreadySuppressed " + alreadySuppressed +
    " badCopyright " + badCopyright + " acceptedCount " + acceptedCount) ;
}

async function checkCopyrightByBibidForOpenAIImages(req, res) {

  let count = 0 ;
  let outOfCopyright = 0 ;
  let inCopyright = 0 ;

  let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
      "?wt=json&rows=999999&fl=id,url,title,bibId&sort=id asc&q=openAIDescription:* AND -suppressed:* AND -bibId:\"\" " + 
        "AND -openAIDescription:(\"No preview available\") AND " +
        "-openAIDescription:(\"I can't provide assistance with that request\")"
    ) ; 
   if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response)) {
     res.write(" Failed to find any records, status: " + solrRes.status + "\n") ;
     if (solrRes.data) res.write(" Solr data: " + JSON.stringify(solrRes.data) + "\n") ;
     res.end() ;
     return ;
   }
   res.write(" Found: " + solrRes.data.response.numFound + "\n") ;

   let docs = solrRes.data.response.docs ;
   for (let doc of docs) {
    count++ ;
    console.log("doc: " + JSON.stringify(doc)) ;
    let c = await getCopyightStatus(res, doc.bibId) ;
    res.write("" + count + "," + doc.bibId + "," + doc.id + "," + c + "\n") ;
    if (c == "Out of Copyright") outOfCopyright++ ;
    else inCopyright++ ;

    // update record 
 
    let updatedFields = {
      copyright: c
    }

    //res.write("updating " + doc.id ) ;
    await updateDoc(doc.id, updatedFields) ;

   }

   res.write("\nCount " + count + " outOfCopyright " + outOfCopyright + " inCopyright " + inCopyright) ;
   res.end() ;
   console.log("Count " + count + " outOfCopyright " + outOfCopyright + " inCopyright " + inCopyright) ;  
}

async function getCopyightStatus(res, bibId) {

  for (let retry=0;retry<3;retry++){  // seems to get over-wrought..

    try {
      console.log("Checking //" + bibId + "//" + url + " https://soa.nla.gov.au/apps/v1/copyrightstatus/" + bibId) ;
      let eRes = await axios.get("https://soa.nla.gov.au/apps/v1/copyrightstatus/" + bibId) ; 

      if (!eRes.status == 200) throw "Cant getCopyightStatus, server returned http resp " + eRes.status ;
      if (!eRes.data) throw "Cant getCopyightStatus, server returned no data" ;
      console.log(bibId + " returned data: " + eRes.data) ;
      let i = eRes.data.indexOf("<copyrightStatus>") ;
      if (i < 0) throw ("No copyrightStatus!?") ;
      let j = eRes.data.indexOf("</copyrightStatus>", i+17) ;

      return eRes.data.substring(i+17, j) ;
    }
    catch (e) {
      console.log("err getCopyightStatus bibId: " + bibId + " err " + e) ;
      if (retry == 2) throw e ;
      else {
        console.log("retrying " + retry) ;
        await new Promise(resolve => setTimeout(resolve, 1000)) ;  // wait a sec..
      }
    }
  }
  throw "crazy" ;
}

const VISION35_SCAN_CHECKPOINT_FILENAME = "vision35ScanCheckpoint.data" ;

async function generatePhi35DescriptionForOAimageDescriptions(req, res) {

  let count = 0 ;
  let suppressed = 0 ;
  let newlySuppressed = 0 ;

  try {

    // try using the MicrosoftVision model to describe images and identify images which might be sus based on their metadata

    let lastId = "" ;
    if (fs.existsSync(VISION35_SCAN_CHECKPOINT_FILENAME)) 
      lastId = fs.readFileSync(VISION35_SCAN_CHECKPOINT_FILENAME) ;

    if (!lastId) lastId = 'a' ;
    //lastId = 'a' ; // DEBUG
    res.write("generatePhi35DescriptionForOAimageDescriptions starting from id: " + lastId + "\n") ;
    console.log("generatePhi35DescriptionForOAimageDescriptions starting from id: " + lastId + "\n") ;

    let solrRes = await axios.get(appConfig.solr.getSolrBaseUrl() + "pictures/select" +
   // "?wt=json&rows=999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id:\"http://nla.gov.au/nla.obj-130766338/image\"") ;  // DEBUG

       // REAL WAS : "?wt=json&rows=999999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id: {\"" + lastId + "\" TO \"z\"]") ; 
//fix up first run - those without v12 were not given title to help!
// another run - gen for those with no vision35 yet 11sep24
       "?wt=json&rows=999999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=openAIDescription:* AND -msVision35Description:*") ; 
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
      let  msVisionResp = await getVisionDescriptionAndJudgement(localCopyUrl, doc.title) ;
    //  res.write("msVisionResp:" + msVisionResp + "//\n") ;

      if (msVisionResp.description) {

     //   console.log("about to get embedding..") ;
        let clipEmbedding = await util.getEmbedding(msVisionResp.description) ;
       // console.log("got embedding") ;

        let updatedFields = {
          msVision35Description: msVisionResp.description,
          msVision35DescriptionVector: setEmbeddingsAsFloats(clipEmbedding)
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
        await updateDoc(doc.id, updatedFields) ;
      }
      else res.write("no description generated for image") ;


      count++ ;
      if ((count % 100) == 0) {
        res.write("checkpointing count " + suppressed + "/" + count + " newly sppressed: " + newlySuppressed + " id " + doc.id) ;
        console.log("checkpointing count " + suppressed + "/" + count + " newly sppressed: " + newlySuppressed + " id " + doc.id) ;
        fs.writeFileSync(VISION35_SCAN_CHECKPOINT_FILENAME, doc.id) ;
        //break ;// DEBUG
      }
      // if (count >= 101) break ;
    }

    //appConfig.llmUrl
  }
  catch (e) {
    console.log("generatePhi35DescriptionForOAimageDescriptions err " + e) ;
    res.write("generatePhi35DescriptionForOAimageDescriptions err " + e) ;
    console.log(e.stack) ;
  }
  res.write("\ncount: " + count + " suppressed count:" + suppressed + " newly sppressed: " + newlySuppressed + "\n") ;
  console.log("\generatePhi35DescriptionForOAimageDescriptions count: " + count + " suppressed count:" + suppressed + " newly sppressed: " + newlySuppressed  + "\n") ;
  res.end() ;
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

       // REAL WAS : "?wt=json&rows=999999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=id: {\"" + lastId + "\" TO \"z\"]") ; 
//fix up first run - those without v12 were not given title to help!
       "?wt=json&rows=999999&fl=id,url,title,suppressed,manuallyForcedUnsuppressed&sort=id asc&q=-msVisionDescription:v12") ; 
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
      let  msVisionResp = await getVisionDescriptionAndJudgement(localCopyUrl, doc.title) ;
    //  res.write("msVisionResp:" + msVisionResp + "//\n") ;

      if (msVisionResp.description) {

     //   console.log("about to get embedding..") ;
        let clipEmbedding = await util.getEmbedding(msVisionResp.description) ;
       // console.log("got embedding") ;

        let updatedFields = {
          msVisionDescription: "V12: " + msVisionResp.description,
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
        await updateDoc(doc.id, updatedFields) ;
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


async function getVisionDescriptionAndJudgement(imageUrl, title) { 


  //curl --header "Content-Type: application/json"  -G -X GET  
  //   --data-urlencode 'imageUrl=https://hinton.nla.gov.au:5550/static/pics/995/nla.obj-131379995.jpg'
  //   --data-urlencode 'optionalMetadata=Image title is "Fire engulfing the wing and engine of a replica aeroplane during an emergency training demonstration at the Aviation Rescue and Fire Fighting training area, Brisbane Airport, 30 June 2005". ' http://localhost:6688/describeAndNsfwImage

  const queryParams = {
    imageUrl: imageUrl
  } ;
  if (title) {
    let t = title.trim() ;
    if (t.startsWith('[')) t = t.substring(1) ;
    let i = t.indexOf(']') ;
    if (i > 0) t = t.substring(0, i) ;
    i = t.indexOf('[') ;
    if (i > 0) t = t.substring(0, i) ;
    i = t.indexOf('/') ;
    if (i > 0) t = t.substring(0, i) ;
    t = t.replaceAll(/"/g, "").trim() ;
    if (t.length > 120) t = t.substring(0, 120).trim() ;
    if (t) {
      queryParams.optionalMetadata = "Image title is \"" + t + "\". " ;
    }
  }
  const params = new url.URLSearchParams(queryParams);

  console.log("off to vision with " + appConfig.visionUrl + "?" + params) ;
  let eRes = await axios.get(appConfig.textEmbeddingURL + "?" + params) ; 

  try {
    /*
     console.log("off to vision with " + appConfig.visionUrl  + "?imageUrl=" + imageUrl) ;
    let eRes = await axios.get(appConfig.visionUrl  + "?imageUrl=" + imageUrl, // params,   
      {         
        headers: {'Content-Type': 'application/json'}
      }  
    ) ;
     */

    let eRes = await axios.get(appConfig.visionUrl  + "?" + params,    
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