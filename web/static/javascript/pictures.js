



window.addEventListener("load", (event) => {
  //console.log("loaded") ;

  function searchClick() {

   // document.getElementById("searchForm").submit() ;
  }
  
  
  function formatDate(yyyyHmmHdd) {
  
    return yyyyHmmHdd.substring(8) + yyyyHmmHdd.substring(4, 8) + yyyyHmmHdd.substring(0, 4) ;
  }

  
  let t =  document.getElementById("searchButton") ;
  //if (t) t.addEventListener("click", searchClick) ;

  t = document.getElementById('stxt') ;
  if (t) t.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchClick() ;
    }
  }) ;
}




  /*
  document.addEventListener('click', function (e) {
   
    console.log("got clik");
    if (e.target.className == 'showHide') {
      let t = e.target ;
      let v = t.innerText ;
      // alert("click on " + v + " id " + t.id) ;

      if (t.id == "showAll") {
        for (let e1 of document.getElementsByClassName("showHide")) {
          let e1id = e1.id ;
          if (e1id == "showAll") continue ;
          if (e1id == "hideAll") continue ;
          e1.innerText = "Hide" ;
         document.getElementById(e1id.substring(1)).className = 'show' ;
        }

        return ;
      }
      if (t.id == "hideAll") {
        for (let e1 of document.getElementsByClassName("showHide")) {
          let e1id = e1.id ;
          if (e1id == "showAll") continue ;
          if (e1id == "hideAll") continue ;
          e1.innerText = "Show" ;
         document.getElementById(e1id.substring(1)).className = 'hide' ;
        }        

        return ;
      }      
      
      if (v == "Show") {
        t.innerText = "Hide" ;
        document.getElementById(t.id.substring(1)).className = 'show' ;
      }
      else {
        t.innerText = "Show" ;
        document.getElementById(t.id.substring(1)).className = 'hide' ;
      }
    }
    else if (e.target.className == 'fclicktarget') {
      let t = e.target ;
      let v = t.innerText ;
      let n = t.parentElement.parentElement.parentElement.parentElement.parentElement.children[0].innerText ;
      addFacet(n, v) ;
    }
    else if (e.target.className == 'correct') {
      //alert("correct " + e.target.id.substring(4)) ;
      this.location.href = "/correct?id=" + e.target.id.substring(4) ;
    }

  }) ;



  t = window.location.href ; 
  //let i = t.indexOf('?') ;
  //t = ((i > 0) ? t.substring(0, i) : t) + '?stxt=' + encodeURIComponent(stxt) + '&keywordScaling=' + keywordScaling ;

  if (document.getElementById('stxt') && document.getElementById('stxt').value) searchClick() ; // initial search is ready (passed on url)

  t = window.location.href ;
  console.log("t=" + t) ;
  let i = t.indexOf("#id=") ;
  if (i > 0) {
    let blk = t.substring(i+4) ;
    console.log("blk is " + blk) ;
    let e = document.getElementById(blk) ;
    let tdiv = '' ;
    if (e) {

        e.innerText = "Hide" ;
        console.log("e innertext " + e.innerText + ", className " + e.className) ;
        tdiv =  document.getElementById(e.id.substring(1)) ;
        tdiv.className = 'show' ;
        console.log("set " + e.id.substring(1) + " class to " + document.getElementById(e.id.substring(1)).className) ;
        
        while (true) {
          e = e.parentElement ;
          if (e == null) break ;
          if (e.className == "hide") {
            console.log("setting show on " + e.id) ;
            e.className = "show" ;
            document.getElementById("b" + e.id).innerText = "Hide" ;
          } 
        }  
        document.getElementById(blk).scrollIntoView() ;
        tdiv.style.borderLeft = "10px solid red" ; 
        tdiv.style.paddingLeft = "10px" ; 
        console.log("tdiv set") ;
      
    }
  }
 }) ;
*/

