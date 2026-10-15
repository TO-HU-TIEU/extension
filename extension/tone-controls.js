(()=>{
  document.querySelectorAll('.module-nav button').forEach(button=>{const label=button.querySelector('.panel-nav-label')?.textContent?.trim();if(label)button.title=label});
  const select=document.getElementById('replyTone');
  if(!select)return;
  const wrap=document.createElement('div');wrap.className='tone-choice';
  [['male','Nam'],['female','Nữ']].forEach(([value,label])=>{const button=document.createElement('button');button.type='button';button.dataset.tone=value;button.textContent=label;button.addEventListener('click',()=>{select.value=select.value===value?'':value;select.dispatchEvent(new Event('change',{bubbles:true}));sync()});wrap.append(button)});
  select.after(wrap);function sync(){wrap.querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.tone===select.value));document.querySelector('.inline-tone-field')?.classList.toggle('tone-required',!select.value)}select.addEventListener('change',sync);sync();
  const toneCard=document.getElementById('toneSettings'),styleField=document.getElementById('stylePickerField');
  if(toneCard&&styleField){const inline=document.createElement('div');inline.className='inline-tone-field';const label=document.createElement('label');label.textContent='Tone';label.htmlFor='replyTone';inline.append(label,wrap);styleField.after(inline);toneCard.hidden=true;styleField.closest('.config-card')?.classList.add('style-tone-card');sync()}
  const prompt=document.getElementById('stylePrompt'),promptLabel=document.querySelector('label[for="stylePrompt"]');
  if(prompt&&promptLabel&&toneCard){const details=document.createElement('details');details.open=true;details.className='prompt-collapse';const summary=document.createElement('summary');summary.textContent='Prompt';details.append(summary,promptLabel,prompt);toneCard.after(details)}
})();
