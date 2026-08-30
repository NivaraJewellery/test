const { getSql, send } = require('./_db');
const { getVariants } = require('./_variants');
module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return send(response,405,{error:'Method not allowed'});
  try {
    const sql=getSql();
    const products=await sql`select p.id,p.name,p.type,p.category,p.price,p.stock,p.description,p.code,p.care,p.image,p.image_2,p.image_3,c.id as collection_id,c.slug as collection_slug,c.name as collection_name from products p left join collections c on c.id=p.collection_id where p.active=true order by p.id`;
    const map=await getVariants(sql,products.map(p=>p.id));
    for(const p of products){ p.variants=map.get(Number(p.id))||[]; if(p.variants.length) p.stock=p.variants.reduce((s,v)=>s+Number(v.stock||0),0); }
    response.setHeader('Cache-Control','public, s-maxage=15, stale-while-revalidate=60');
    return send(response,200,{products});
  } catch(e){ return send(response,500,{error:'Unable to load products'}); }
};
