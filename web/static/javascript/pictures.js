



window.addEventListener("load", (event) => {
  console.log("loaded START") ;
/*
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
*/
  for (let ele of document.getElementsByClassName("imageSuppressed")) {

    console.log(" got ele to watch " + ele) ;
    ele.addEventListener('click', function (e) {
   
      console.log("got imageSuppressed click");
      e.target.parentElement.parentElement.getElementsByTagName("a")[0].className = "" ;
      e.target.parentElement.className = "hide" ;
  
    }) ;  
  }

  console.log("loaded DONE") ;
}) ;
