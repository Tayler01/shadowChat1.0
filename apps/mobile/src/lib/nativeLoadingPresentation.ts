export const NATIVE_LOADING_CSS = `
html .streamlined-loading__fill { width:100%; margin-inline:0; transform-origin:left center; transform:scaleX(var(--shadowchat-loading-fill,0)); animation:none; }
html:is([data-comfort-motion='reduced'],[data-comfort-motion='none']) .streamlined-loading__fill { transition:none!important; }
`;
// New hosted editions report real work. Legacy pages stay indeterminate; no
// timer pretends to know their module completion or remaining duration.
export const NATIVE_LOADING_PRESENTATION_SCRIPT = `
(function(document){
  function install(){
    if(!document.documentElement || document.getElementById('shadowchat-native-loading-presentation'))return;
    var style=document.createElement('style');style.id='shadowchat-native-loading-presentation';
    style.textContent=${JSON.stringify(NATIVE_LOADING_CSS)};document.documentElement.appendChild(style);
  }
  window.addEventListener('shadowchat:startup-work',function(event){
    var state=event.detail;
    if(state && typeof state.progress==='number' && isFinite(state.progress) && state.progress>=0 && state.progress<=1 && document.documentElement)
      document.documentElement.style.setProperty('--shadowchat-loading-fill',String(state.progress));
  });
  if(document.documentElement)install();else{
    var observer=new MutationObserver(function(){if(document.documentElement){install();observer.disconnect();}});
    observer.observe(document,{childList:true,subtree:true});
  }
})(document);true;
`;
