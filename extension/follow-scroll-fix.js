(function(){
  if(globalThis.__assistantFollowScrollFixed)return;
  globalThis.__assistantFollowScrollFixed=true;
  const nativeScrollBy=window.scrollBy.bind(window);
  const findScroller=()=>{
    const row=document.querySelector('[data-testid="UserCell"],article[data-testid="UserCell"]');
    for(let node=row?.parentElement;node&&node!==document.body;node=node.parentElement){
      if(node.scrollHeight>node.clientHeight+20&&/auto|scroll|overlay/.test(getComputedStyle(node).overflowY))return node;
    }
    return null;
  };
  window.scrollBy=(optionsOrX,maybeY)=>{
    const scroller=findScroller();
    if(scroller){const options=typeof optionsOrX==='object'?optionsOrX:{left:optionsOrX,top:maybeY};scroller.scrollBy(options);return;}
    nativeScrollBy(optionsOrX,maybeY);
  };
})();
