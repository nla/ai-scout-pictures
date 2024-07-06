const express = require('express') ;
const router = express.Router() ;
const log = require('log4js').getLogger('home') ;
const util = require('../util/utils') ;
const solr = require('../util/solr') ;
const axios = require('axios') ;


let appConfig = null ;
        
function init(appConfigParm) {

  appConfig = appConfigParm ;
  router.get('/',		    async (req, res) => { index(req, res) }) ;
  return router ;  
}

async function getDocCount() {

  let solrRes = null ;

  try {
    solrRes = await axios.post(
      appConfig.solr.getSolrBaseUrl() + "pictures/select",
      "wt=json&rows=0&q=*:*") ;
  }
  catch (e) {
    console.log("Error solr query " + e) ;
    if( e.response) console.log(e.response.data) ; 
    throw e ;
  }
  
  if ((solrRes.status == 200) && solrRes.data &&  solrRes.data.response) 
    return solrRes.data.response.numFound ; 
  else throw new Error("couldnt get picture count") ;
    throw new Error("couldnt get single like doc ") ;
}

async function index(req, res) {

  let stxt = '' ;

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
    if (req.query.stxt) stxt = req.query.stxt ;
    if (req.query.metadataKeyword) scalings.metadataKeyword = req.query.metadataKeyword ;
    if (req.query.openAIKeyword) scalings.openAIKeyword = req.query.openAIKeyword ;
    if (req.query.imageEmbedding) scalings.imageEmbedding = req.query.imageEmbedding ;
    if (req.query.metadataEmbedding) scalings.metadataEmbedding = req.query.metadataEmbedding ;
    if (req.query.openAIEmbedding) scalings.openAIEmbedding = req.query.openAIEmbedding ;
    if (req.query.msVisionKeyword) scalings.msVisionKeyword = req.query.msVisionKeyword ;
    if (req.query.msVisionEmbedding) scalings.msVisionEmbedding = req.query.msVisionEmbedding ;
  }

  let err = null ;
  let pictureCount = -1 ;
  try {
    pictureCount = await getDocCount() ;
  }
  catch (e) {
    err = "" + e ;
  }

  res.render('home', {req: req, appConfig: appConfig, stxt: stxt, scalings: scalings,                       
                      pictureCount: pictureCount, err:err}) ;
}

module.exports.init = init ;