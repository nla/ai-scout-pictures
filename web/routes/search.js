const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const axios = require('axios') ;

let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		              async (req, res) => { search(req, res) }) ;
  return router ;  
}

async function search(req, res) {

  console.log("in search rq=" +JSON.stringify(req.query));
  let stxt = '' ;
  let like = '' ;

  let scalings = {
    metadataKeyword: 0.15,
    openAIKeyword: 0,
    imageEmbedding: 1,
    metadataEmbedding: 0,
    openAIEmbedding: 0,
    msVisionKeyword: 0.15,
    msVisionEmbedding: 0.2
  } ;

  if (req.query) {
    if (req.query.like) like = req.query.like ;
    if (req.query.stxt) stxt = req.query.stxt ;
    if (req.query.metadataKeyword) scalings.metadataKeyword = req.query.metadataKeyword ;
    if (req.query.openAIKeyword) scalings.openAIKeyword = req.query.openAIKeyword ;
    if (req.query.imageEmbedding) scalings.imageEmbedding = req.query.imageEmbedding ;
    if (req.query.metadataEmbedding) scalings.metadataEmbedding = req.query.metadataEmbedding ;
    if (req.query.openAIEmbedding) scalings.openAIEmbedding = req.query.openAIEmbedding ;
    if (req.query.msVisionKeyword) scalings.msVisionKeyword = req.query.msVisionKeyword ;
    if (req.query.msVisionEmbedding) scalings.msVisionEmbedding = req.query.msVisionEmbedding ;
  }
  //console.log("scalings2 " + JSON.stringify(scalings)) ;
  let err = null ;
  let searchResults = null ;

  try {
    searchResults = await runSearch(like, stxt, scalings) ;
    console.log("back from searchResults") ;
    console.log("FROM runsearch got data " + searchResults.response.docs.length);
  }
  catch (e) {
    err = e ;
  }


  res.render('searchPage', {req: req, appConfig: appConfig, stxt: stxt, scalings: scalings,
                            searchResults: searchResults, like: like,
                            err:err}) ;
}

async function runSearch(like, stxt, scalings) {

  let resp = null ;
  console.log("in runsearch, like=" + like + ", stxt=" + stxt) ;

  if (like) resp = await getLike(like, scalings) ;
  else  resp = await getTextSearch(stxt, scalings) ;
  console.log("runsearch RET data " + resp.response.docs.length);

  return resp ;
}

async function getLike(like, scalings) {

  console.log("like " + like) ;
  // get embedding, find images with a similar embedding

  let selectData = 
  "&wt=json&rows=1" +
  "&q=id:\"" + like + "\"" +
  "&q.op=AND" +
  "&fl=id,imageVector,metadataVector,openaiDescriptionVector,msVisionDescriptionVector" ; 

  console.log("like query" + selectData) ;

  let solrRes = null ;

  try {
    solrRes = await axios.post(
      appConfig.solr.getSolrBaseUrl() + "pictures/select",
      selectData) ;
  }
  catch (e) {
    console.log("Error solr query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  console.log("like search status: " + solrRes.status) ;

  if (!((solrRes.status == 200) && solrRes.data &&  solrRes.data.response &&  solrRes.data.response.docs)) 
    throw new Error("couldnt get single like doc ") ;

  let likeVector = solrRes.data.response.docs[0].imageVector ;

  let q = "({!knn f=imageVector topK=50}" + JSON.stringify(likeVector) + ")"  ;

  selectData = 
  "&wt=json&rows=100" +
  "&q=" + q + 
  "&q.op=AND" +
  "&fl=id,title,author,format,originalDescription,notes,subjects,openAIDescription,msVisionDescription,url,bibId,score,imageVector,metadataVector,openaiDescriptionVector,msVisionDescriptionVector,suppressed" ; // rm embedding

  solrRes = null ;
  
  try {
    solrRes = await axios.post(
      appConfig.solr.getSolrBaseUrl() + "pictures/select",
      selectData) ;
  }
  catch (e) {
    console.log("Error solr query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  console.log("search status: " + solrRes.status) ;
  
  if ((solrRes.status == 200) && solrRes.data) {


    let qEmb = likeVector ;

    for (let doc of solrRes.data.response.docs) {
      if (doc.imageVector) {
        doc.imageSim = innerProduct(qEmb, doc.imageVector) ;
        delete doc["imageVector"] ;
      }
      else doc.imageSim = -100 ; 
      if (doc.metadataVector) {
        doc.metadataSim = innerProduct(qEmb, doc.metadataVector) ;
        delete doc["metadataVector"] ;
      }  
      else doc.metadataSim = -100 ;    
      if (doc.openaiDescriptionVector) {
        doc.openaiSim = innerProduct(qEmb, doc.openaiDescriptionVector) ;
        delete doc["openaiDescriptionVector"] ;
      }
      else doc.openaiSim = -100 ;  
      if (doc.msVisionDescriptionVector) {
        doc.msVisionSim = innerProduct(qEmb, doc.msVisionDescriptionVector) ;
        delete doc["msVisionDescriptionVector"] ;
      }
      else doc.msVisionSim = -100 ;    
    }

    return solrRes.data ;
  }
  else throw new Error("Unexpected response " + solrRes.status) ;

}

async function getTextSearch(stxt, scalings) {

  let origQuestion = stxt ;
  stxt = cleanseLite(stxt).trim() ;
  if (!stxt) throw new Error("Enter a query to find pictures in the NLA collection") ;

  let qVec = await util.getEmbedding(stxt) ;


  let clauses = [] ;
  if (scalings.imageEmbedding > 0) 
    clauses.push("({!knn f=imageVector topK=50}" + JSON.stringify(qVec) + ")^" + scalings.imageEmbedding) ;
  if (scalings.metadataEmbedding > 0) 
    clauses.push("({!knn f=metadataVector topK=50}" + JSON.stringify(qVec) + ")^" + scalings.metadataEmbedding) ;
  if (scalings.openAIEmbedding > 0) 
    clauses.push("({!knn f=openaiDescriptionVector topK=50}" + JSON.stringify(qVec) + ")^" + scalings.openAIEmbedding) ;
  if (scalings.msVisionEmbedding > 0) 
    clauses.push("({!knn f=msVisionDescriptionVector topK=50}" + JSON.stringify(qVec) + ")^" + scalings.msVisionEmbedding) ;

  if (scalings.metadataKeyword > 0) {
    clauses.push("title:(\"" + stxt + "\")^" + (scalings.metadataKeyword)) ;
    clauses.push("titleStemmed:(" + stxt + ")^" + (scalings.metadataKeyword / 2)) ;
    clauses.push("metadataText:(\"" + stxt + "\")^" + (scalings.metadataKeyword) / 3) ;
    clauses.push("metadataTextStemmed:(" + stxt + ")^" + (scalings.metadataKeyword / 6)) ;
  }
  if (scalings.openAIKeyword > 0) {
    clauses.push("openAIDescription:(\"" + stxt + "\")^" + (scalings.openAIKeyword) / 2) ;
    //clauses.push("openAIDescriptionStemmed:(" + stxt + ")^" + (scalings.openAIKeyword / 4)) ; // didnt build this properly FIX TODO
    clauses.push("openAIDescription:(" + stxt + ")^" + (scalings.openAIKeyword / 4)) ;
  }

  if (scalings.msVisionKeyword > 0) {
    clauses.push("msVisionDescription:(\"" + stxt + "\")^" + (scalings.msVisionKeyword) / 2) ;
    clauses.push("msVisionDescriptionStemmed:(" + stxt + ")^" + (scalings.msVisionKeyword / 4)) ; 
    clauses.push("msVisionDescription:(" + stxt + ")^" + (scalings.msVisionKeyword / 4)) ;
  }

  

  if (clauses.length == 0) throw new Error("At least one scaling must be greater than zero!") ;
  let query = clauses.join(" OR ") ;
  /*
  let query = "({!knn f=imageVector topK=50}" + JSON.stringify(qVec) + ")^" + scalings.imageEmbedding + 
              " OR (" +
                "metadataTextStemmed:(" + stxt + ")^" + (scalings.metadataKeyword / 2) + " OR " +
                "metadataText:(" + stxt + ")^" + scalings.metadataKeyword  + // " OR " +

              ")" ;
*/
  //console.log("SET " + set + " filename " + filename) ;


  let selectData = 
    "&wt=json&rows=100" +
    "&q=" + query + 
    "&q.op=AND" +
    //"&facet=true&facet.field=set&facet.field=filename" +
    "&fl=id,title,author,format,originalDescription,notes,subjects,openAIDescription,msVisionDescription,bibId,url,score,imageVector,metadataVector,openaiDescriptionVector,msVisionDescriptionVector,suppressed" ; // rm embedding

  console.log("ssearch query part: " + selectData.replaceAll(/\[[^\]]*\]/gi, "[..vectors..]").replaceAll(" OR ", "\n OR ")  + "\nurl: " + 
                appConfig.solr.getSolrBaseUrl() + "pictures/select") ;
  let solrRes = null ;
  
  try {
    solrRes = await axios.post(
      appConfig.solr.getSolrBaseUrl() + "pictures/select",
      selectData) ;
  }
  catch (e) {
    console.log("Error solr query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }

  console.log("search status: " + solrRes.status) ;
  
  if ((solrRes.status == 200) && solrRes.data) {

    let parts = ("" + qVec).split(",") ;
    let qEmb = [] ;
    for (let i=0;i<768;i++) qEmb[i] = Number(parts[i]) ;
    for (let doc of solrRes.data.response.docs) {
      if (doc.imageVector) {
        doc.imageSim = innerProduct(qEmb, doc.imageVector) ;
        delete doc["imageVector"] ;
      }
      else doc.imageSim = -100 ; 

      if (doc.metadataVector) {
        doc.metadataSim = innerProduct(qEmb, doc.metadataVector) ;
        delete doc["metadataVector"] ;
      }  
      else doc.metadataSim = -100 ;    

      if (doc.openaiDescriptionVector) {
        doc.openaiSim = innerProduct(qEmb, doc.openaiDescriptionVector) ;
        delete doc["openaiDescriptionVector"] ;
      }
      else doc.openaiSim = -100 ;  

      if (doc.msVisionDescriptionVector) {
        doc.msVisionSim = innerProduct(qEmb, doc.msVisionDescriptionVector) ;
        delete doc["msVisionDescriptionVector"] ;
      }
      else doc.msVisionSim = -100 ;    
    }

    console.log("GTS RET data " + solrRes.data.response.docs.length);
    return solrRes.data ;
  }
  else throw new Error("Unexpected response " + solrRes.status) ;

}



function cleanseLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 '():]/g, " ") ;
	return "" ;
}

function cleanseVeryLite(parm) {

	if (typeof(parm) === 'string') return parm.replace(/[^-A-Za-z0-9 .,\!\?'():;\n]/g, " ") ;
	return "" ;
}

function innerProduct(v1, v2) {

  let r = 0 ;
  for (let i=0;i<v1.length;i++) r +=  v1[i] * v2[i] ;
  
  return r ;
}

module.exports.init = init ;