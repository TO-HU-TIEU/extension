(function(){
  const tabs=document.querySelector('.follow-tabs');
  if(!tabs)return;
  const names={following:'user',followers:'users',recent:'user-question'};
  const sync=button=>{
    const mode=button.dataset.followMode;
    if(!mode||button.querySelector('.follow-tab-icon'))return;
    const raw=button.textContent.trim().replace(/^Đã theo dõi gần đây/,'Theo dõi gần đây');
    const icon=document.createElement('span');
    icon.className='follow-tab-icon';
    icon.innerHTML=globalThis.AssistantIcons?.svg(names[mode])||'';
    const label=document.createElement('span');
    label.className='follow-tab-label';
    label.textContent=raw;
    button.replaceChildren(icon,label);
  };
  const syncAll=()=>tabs.querySelectorAll('button[data-follow-mode]').forEach(sync);
  syncAll();
  new MutationObserver(syncAll).observe(tabs,{childList:true,subtree:true});
})();
