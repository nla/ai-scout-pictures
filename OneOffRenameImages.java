import java.util.* ;
import java.io.* ;

 
// 1Apr24 -one of restructure pic dir

// javac -cp . OneOffRenameImages.java
// java  -cp . OneOffRenameImages  

public class OneOffRenameImages {

	public static void main(String[] args) throws Exception {
	
    final File imageDir = new File("web/static/pics") ;

    for (File f:  imageDir.listFiles()) {

      if (f.isDirectory()) continue ;
      if (!f.isFile()) continue ;
      String p = f.getName() ;
      if (!p.endsWith(".jpg")) continue ;
      int i = p.lastIndexOf("-") ;
      int j = p.lastIndexOf(".jpg") ;
      String ids = p.substring(i+1, j) ;
      long id = Long.parseLong(ids) ;
      String subDirname = "" + (id % 1000) ;
      File subDir = new File(imageDir, subDirname) ;
      if (!subDir.exists()) subDir.mkdir() ;

      File imageFile = new File(subDir, p) ;
      System.out.println("rename " + f + " to " + imageFile) ;
      f.renameTo(imageFile) ;
    }
  }
}