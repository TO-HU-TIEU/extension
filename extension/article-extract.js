(()=>{
const R=ContentReader,metadata=R.structured(document),selectors=globalThis.RemoteConfig?.get('adapters')?.[location.hostname.replace(/^www\./,'')]?.body||['[itemprop="articleBody"]','.singular-content','.detail-content','.article-content','.entry-content','.post-content','article'];
let body=ContentCore.clean(metadata.text),node;
if(body.length<80)for(const selector of selectors){try{const candidate=document.querySelector(selector),text=R.text(candidate);if(text.length>=80){body=text;node=candidate;break}}catch{}}
if(body.length<80){const item=ContentExtractor.extract(document,location.href,false).find(item=>item.url===location.href);if(item){body=item.text;metadata.title=item.title;metadata.publishedAt=item.publishedAt}}
if(body.length<80)return{error:'Không tìm thấy nội dung bài chính. Hãy mở bài chi tiết hoặc dán nội dung gốc.'};
const title=ContentCore.clean(metadata.title||document.querySelector('h1')?.textContent||document.title),text=ContentCore.clean(body.startsWith(title)?body:`${title}\n\n${body}`).slice(0,10000);
return{url:location.href,title,text,publishedAt:metadata.publishedAt||R.published(node||document)||R.date(document.querySelector('meta[property="article:published_time"]')?.content)};
})();
