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
 
// 2Apr24 -Load pictures into SOLR, harvested by me (HarvestPictures)

// javac -cp json-20231013.jar:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/solr-solrj-9.4.0.jar:. LoadPictures2.java
// java  -cp json-20231013.jar:/home/kfitch/tools/solr-9.4.0/server/lib/ext/*:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/*:/home/kfitch/tools/solr-9.4.0/server/solr-webapp/webapp/WEB-INF/lib/solr-solrj-9.4.0.jar:. LoadPictures2  harvest2 > logs/LoadPictures2-harvest2-1 &

public class LoadPictures2 {



	public static void main(String[] args) throws Exception {
	
		new LoadPictures2(new File(args[0])) ;
	}
	
  int pictures = 0 ; 

  final SolrClient client ;


  ArrayList<SolrInputDocument> batchDocs = new ArrayList<SolrInputDocument>(1000) ;


  
  final String solrBase = "http://localhost:8983/solr/pictures" ;

	LoadPictures2(File in) throws Exception {
			
    System.out.println("LoadPictures2 starting file: " + in) ; 

    client = new HttpSolrClient.Builder(solrBase).build() ; 
    //load("200-images-audio/nla.gov.au") ;
    load(in) ;
    client.close() ;
   

		System.out.println("LoadPictures2 done file: " + in + " pictures: " + pictures) ; 
  }

  void load(File in) throws Exception {

    /* read
    >>--//--<<
{"thumbnail_path_ss":"https://nla.gov.au/nla.obj-3192776361","author_tsim":["Henningham, Leigh, 1960-"],"title_tsim":["Understanding The Voice forum at Rockdale Town Hall, Rockdale, New South Wales, 24 June 2023 / Leigh Henningham"],"imageFile":"web/static/pics/361/nla.obj-3192776361.jpg","notes_tsim":["Title from acquisitions documentation."],"pub_date_ssim":["2023"],"id":"10001577","description_tsim":["1 online resource (14 photographs) : TIFF files, colour"],"subject_ssim":["Burney, L. (Linda) -- Photographs","Simpson, Nardi -- Photographs","Jacobs, Narelda -- Photographs","Foster, Craig, 1969- -- Photographs","Minns, Chris -- Photographs","Byrnes, Simon -- Photographs","First Nations National Constitutional Convention (2017 : Uluru, N.T)","Politics and Government - National symbols and events - Uluru Statement from the Heart, 2017","Politics and Government - Referenda - Constitutional recognition","Forums (Discussion and debate) -- New South Wales -- Rockdale -- Photographs","Public meetings -- New South Wales -- Rockdale -- Photographs","Women, Aboriginal Australian -- New South Wales -- Rockdale -- Photographs","Politicians -- New South Wales -- Rockdale -- Photographs","Political activists, Aboriginal Australian -- New South Wales -- Rockdale -- Photographs","Political activists -- New South Wales -- Rockdale -- Photographs","Political participation -- New South Wales -- Rockdale -- Photographs","Referendum -- Australia","Aboriginal Australians -- Legal status, laws, etc. -- Australia","Torres Strait Islanders -- Legal status, laws, etc. -- Australia","Constitutional amendments -- Australia","Rockdale (N.S.W.) -- Buildings, structures, etc. -- Photographs","Australia -- Politics and government"]}
>>--//--<<
 
     */

    BufferedReader br = new BufferedReader(new FileReader(in)) ;
    StringBuffer current = new StringBuffer(8192) ;
    while (true) {
      String line = br.readLine() ;
      if (line == null) break ;
      if (line.equals(">>--//--<<")) {
        if (current.length() > 0) {
          process(current.toString()) ;
          current.setLength(0) ;
        }
      }
      else current.append(line) ; // should only EVER be 1 line!
    }
    if (current.length() > 0) process(current.toString()) ; // shouldnt happen
    br.close() ;
    if (!batchDocs.isEmpty()) {
      client.add(batchDocs) ;
      batchDocs.clear() ;  
    }   
    client.commit() ; 
  }

  void process(String src) throws Exception {

    JSONObject jo = new JSONObject(src) ;
    String bibId = jo.getString("id") ;

/*first run
    if (bibId.compareTo("100000") < 0) return ;    // start from 100000  NOTE  STRING COMPARE, not numeric 
    if (bibId.compareTo("1070468") > 0) return ;   // do up to and including 1070468

    if (bibId.compareTo("1070564") < 0) return ;    
    if (bibId.compareTo("1157063") > 0) return ;   

    if (bibId.compareTo("1157085") < 0) return ;    
    if (bibId.compareTo("1458954") > 0) return ;   

    if (bibId.compareTo("2348436") < 0) return ;    
    if (bibId.compareTo("2408627") > 0) return ;  
*/
    if (bibId.compareTo("2408646") < 0) return ;    
    if (bibId.compareTo("2564124") > 0) return ;  


    

    String thumb = jo.optString("thumbnail_path_ss") ;

    String id = thumb + "/image" ;
    String url = id ;

    String imageFile = jo.getString("imageFile") ;
    JSONArray titles = jo.optJSONArray("title_tsim") ;
    JSONArray authors = jo.optJSONArray("author_tsim") ;
    JSONArray descriptions = jo.optJSONArray("description_tsim") ;
    JSONArray notesA = jo.optJSONArray("notes_tsim") ;
    JSONArray subjs = jo.optJSONArray("subject_ssim") ;


    String contentType = "image/jpeg" ;
    String format = "Picture" ;

    String title = (titles == null) ? "" : titles.getString(0) ; 
    String author = (authors == null) ? "" : authors.getString(0) ;
    String originalDescription = null ;
    if (descriptions != null) {
      for (int i=0;i<descriptions.length();i++) {
        if (i == 0) originalDescription = descriptions.getString(i) ;
        else originalDescription += " " + descriptions.getString(i) ;       
      }
    }
    String notes = null ;
    if (notesA != null) {
      for (int i=0;i<notesA.length();i++) {
        if (i == 0) notes = notesA.getString(i) ;
        else notes += " " + notesA.getString(i) ;
      }
     
    }    
    String subjects = null ;
    if (subjs != null) {
      for (int i=0;i<subjs.length();i++) {
        if (i == 0) subjects = subjs.getString(i) ;
        else subjects += " " + subjs.getString(i) ;
      }     
    }

    String incomingUrl = "https://catalogue.nla.gov.au/catalog/" + bibId ;

    System.out.println("process id " + bibId + " image " + imageFile) ;

      float[] clipImageEmbedding = getImageEmbedding(imageFile) ;


      // build a metadata text description
      String mt = "" ;
      if (title != null) mt = title ;
      if (author != null) mt += " Author: " + author ;
      if (originalDescription != null) mt += " Description: " + originalDescription ;
      if (notes != null) mt += " Notes: " + notes ;
      if (subjects != null) mt += " Subjects: " + subjects ;

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
      if (format != null) doc.setField("format", format) ;
      if (author != null) doc.setField("author", author) ;
      if (originalDescription != null) doc.setField("originalDescription", originalDescription) ;
      if (notes != null) doc.setField("notes", notes) ;
      if (subjects != null) doc.setField("subjects", subjects) ;

      doc.addField("incomingUrls", incomingUrl) ;
      
      if (clipImageEmbedding != null) {
        ArrayList<Float> floats = new ArrayList<Float>(clipImageEmbedding.length) ;
        for (float fl: clipImageEmbedding) floats.add(fl) ; 
        doc.setField("imageVector", floats) ;
      }

      if (mtEmbedding != null) {
        ArrayList<Float> floats = new ArrayList<Float>(mtEmbedding.length) ;
        for (float fl: mtEmbedding) floats.add(fl) ; 
        doc.setField("metadataVector", floats) ;
      }      

      pictures++ ;
//System.out.println("DOC is" + doc) ;
      batchDocs.add(doc) ;
      if (batchDocs.size() >= 1000) {
        client.add(batchDocs) ;
        batchDocs.clear() ;
        client.commit() ;
      }
 
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

