const {Client}=require('pg');
const sql=process.argv[2];
(async()=>{const c=new Client({host:'127.0.0.1',port:55744,user:'postgres',database:'clara_l04'});await c.connect();
const r=await c.query(sql);
for(const row of r.rows) console.log(Object.values(row).map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' | '));
await c.end();})().catch(e=>{console.error('ERR',e.message);process.exit(1)})
