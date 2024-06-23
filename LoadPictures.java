import java.util.* ;
import java.util.concurrent.* ;
import java.io.* ;
import java.util.zip.* ;
import java.net.* ;

import org.apache.solr.client.solrj.SolrClient;
import org.apache.solr.client.solrj.SolrServerException;
import org.apache.solr.client.solrj.impl.HttpSolrClient;
import org.apache.solr.common.SolrInputDocument;

import org.json.* ;
 
// 26Mar24 -Load pictures into SOLR (harvested by Francis)

// javac -cp json-20231013.jar:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/solr-solrj-9.4.0.jar:. LoadPictures.java
// java  -cp json-20231013.jar:/home/kfitch/tools/solr-9.4.0/server/lib/ext/*:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/*:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/solr-solrj-9.4.0.jar:. LoadPictures  > logs/LoadPictures1 &

public class LoadPictures {



	public static void main(String[] args) throws Exception {
	
		new LoadPictures() ;
	}
	
  int pictures = 0 ; 

  final SolrClient client ;


  ArrayList<SolrInputDocument> batchDocs = new ArrayList<SolrInputDocument>(100) ;


  
  final String solrBase = "http://localhost:8983/solr/pictures" ;

	LoadPictures() throws Exception {
			
    client = new HttpSolrClient.Builder(solrBase).build() ; 
    //load("200-images-audio/nla.gov.au") ;
    load("5000/nla.gov.au") ;
    client.close() ;
   

		System.out.println("LoadPictures done: " + pictures) ; 
  }

  void load(String dirName) throws Exception {

    File dir = new File(dirName) ;
    File dirContents[] = dir.listFiles() ;
    for (File subDir: dirContents) {
      if (!subDir.isDirectory()) continue ;
        // get original image
        
     // if (("" + subDir).indexOf("/5f") < 0) continue ;

      System.out.println("Processing " + subDir + " seq " + pictures) ;

      if (subDir.list().length < 1) {
        System.out.println(" empty") ;
        continue ;
      }
      String originalImageFilename = null ;
      for (String f: subDir.list()) {
        if (f.startsWith("nla.obj-") && f.endsWith(".jpg")) {
          originalImageFilename = f ;
          break ;
        }
      }
      if (originalImageFilename == null) {
        System.out.println("no nla image in " + subDir) ;
        continue ;
      }

      File f = new File(subDir, "metadata.json") ;
      if (!f.exists()) throw new Exception("no metadata.json in " + subDir) ;

      String metadata = "" ;
      BufferedReader br = new BufferedReader(new FileReader(f)) ;
      String txt = "" ;
      while ((txt = br.readLine()) != null) metadata += txt ;
      br.close() ;
  
      JSONObject jo = new JSONObject(metadata) ;
      String url = jo.getString("url") ;
      String contentType = jo.optString("content_type") ;
      String title = jo.getString("title") ;
      String bibId = jo.optString("bib_id") ;
      String formGenre = jo.optString("form_genre") ;
      String format = jo.optString("format") ;
      String author = jo.optString("author") ;
      String originalDescription = jo.optString("original_description") ;
      String notes = jo.optString("notes") ;
      String openAIDescription = jo.getString("description") ;
      String id = jo.getString("id") ;

      JSONArray ius = jo.optJSONArray("incoming_urls") ;
      ArrayList<String> incomingUrls = new ArrayList<String>() ;
      if (ius != null){
        for (int i=0;i<ius.length();i++) 
          incomingUrls.add(ius.getString(i)) ;
      }

      float[] clipImageEmbedding = getImageEmbedding("" + subDir + "/" + originalImageFilename) ;
      float[] openAIDescriptionEmbedding = getTextEmbedding(openAIDescription) ;
      if (openAIDescriptionEmbedding != null) {
        float dotProd = dotProduct(clipImageEmbedding, openAIDescriptionEmbedding) ;
        System.out.println("  DEdotProd " + dotProd) ;

      }

      // build a metadata text description
      String mt = "" ;
      if (title != null) mt = title ;
      if (author != null) mt += " Author: " + author ;
      if (originalDescription != null) mt += " Description: " + originalDescription ;
      if (notes != null) mt += " Notes: " + notes ;
      mt = mt.replaceAll("[\\[\\]\\(\\)\\/]", " ").replaceAll("http\\:[^\\s]*", " ") ;
      float[] mtEmbedding = getTextEmbedding(mt) ;
      float dotProd = dotProduct(clipImageEmbedding, mtEmbedding) ;
      System.out.println("  MTdotProd " + dotProd) ;

      SolrInputDocument doc = new SolrInputDocument() ;
      doc.setField("id", id) ;
      if (url != null) doc.setField("url", url) ;
      if (contentType != null) doc.setField("contentType", contentType) ;
      if (title != null) doc.setField("title", title) ;
      if (bibId != null) doc.setField("bibId", bibId) ;
      if (formGenre != null) doc.setField("formGenre", formGenre) ;
      if (format != null) doc.setField("format", format) ;
      if (author != null) doc.setField("author", author) ;
      if (originalDescription != null) doc.setField("originalDescription", originalDescription) ;
      if (notes != null) doc.setField("notes", notes) ;

      if (openAIDescription != null) doc.setField("openAIDescription", openAIDescription) ;
      if (notes != null) doc.setField("notes", notes) ;

      for (String t: incomingUrls) doc.addField("incomingUrls", t) ;
      
      if (clipImageEmbedding != null) {
        ArrayList<Float> floats = new ArrayList<Float>(clipImageEmbedding.length) ;
        for (float fl: clipImageEmbedding) floats.add(fl) ; 
        doc.setField("imageVector", floats) ;
      }

      if (openAIDescriptionEmbedding != null) {
        ArrayList<Float> floats = new ArrayList<Float>(openAIDescriptionEmbedding.length) ;
        for (float fl: openAIDescriptionEmbedding) floats.add(fl) ; 
        doc.setField("openaiDescriptionVector", floats) ;
      }

      if (mtEmbedding != null) {
        ArrayList<Float> floats = new ArrayList<Float>(mtEmbedding.length) ;
        for (float fl: mtEmbedding) floats.add(fl) ; 
        doc.setField("metadataVector", floats) ;
      }      

      pictures++ ;

      batchDocs.add(doc) ;
      if (batchDocs.size() >= 100) {
        client.add(batchDocs) ;
        batchDocs.clear() ;
      }
    }

    if (!batchDocs.isEmpty()) {
      client.add(batchDocs) ;
      batchDocs.clear() ;  
    }   
    client.commit() ; 

  }

  float dotProduct(float[] v1, float[] v2) {

    double dotProd = 0d ;
    for (int i=0;i<768;i++) dotProd += v1[i] * v2[i] ;
    return (float) dotProd ;
  }

  float[] getTextEmbedding(String description) throws Exception {

    if (description == null) return null ;

    // CLIP borks on unicode japanese etc
    String d = description.replace("’", "'").replaceAll("[^\\u0000-\\u00ff]", " ").replaceAll("\\s+", " ") ;

    for (int maxLen = 310;maxLen>150;maxLen=maxLen-10) {
      
      if (d.length() > maxLen) {
        for (int i=maxLen;i>maxLen-10;i--) {
          if (d.charAt(i) == ' ') {
            d = d.substring(0, i) ;
            break ;
          }
        }
        if (d.length() > maxLen) d = d.substring(0, maxLen) ;
      }
      //System.out.println("getting description embedding for  len " + d.length() + ": " + d) ;
      try {
        HttpURLConnection con = (HttpURLConnection) new URL("http://localhost:5555/getTextEmbedding?text=" + URLEncoder.encode(d, "UTF-8")).openConnection() ;
        con.setRequestMethod("GET") ;

        String resp = "" ;
        InputStreamReader in = new InputStreamReader(con.getInputStream()) ;
        BufferedReader br = new BufferedReader(in) ;
        String txt = "" ;
        while ((txt = br.readLine()) != null) resp += txt ;
        in.close() ;
        // System.out.println("resp:" + resp) ;
        return createEmbedding(resp) ;
      }
      catch (Exception e) {
        //System.out.println("failed at maxLen " + maxLen + ".. retrying.. " + e) ;
      }
    }
    throw new Exception("..gave up") ;
  }

  float[] getImageEmbedding(String filename) throws Exception {

    //System.out.println("getting embedding for " + filename) ;
    HttpURLConnection con = (HttpURLConnection) new URL("http://localhost:5555/getImageEmbedding?imagePath=" + filename).openConnection() ;
    con.setRequestMethod("GET") ;

    String resp = "" ;
    InputStreamReader in = new InputStreamReader(con.getInputStream()) ;
    BufferedReader br = new BufferedReader(in) ;
    String txt = "" ;
    while ((txt = br.readLine()) != null) resp += txt ;
    in.close() ;
    // System.out.println("resp:" + resp) ;
    return createEmbedding(resp) ;
  }

  float[] createEmbedding(String resp) throws Exception {

    if (!(resp.startsWith("[") && resp.endsWith("]"))) throw new Exception("dud embedding: " + resp) ;
    float em[] = new float[768] ;
    String p[] = resp.substring(1, resp.length() -1).split(", ") ;
    for (int i=0;i<768;i++) em[i] = (float) Double.parseDouble(p[i]) ;
  //  float norm = 0f ;
    //for (int i=0;i<768;i++) norm += em[i] * em[i] ;
    //System.out.println("   norm " + norm) ;
    return em ;
  }
}

