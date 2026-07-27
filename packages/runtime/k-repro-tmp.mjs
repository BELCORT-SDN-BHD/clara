process.env.RELAY_TEST_MODE ??= "1";
const { readTotalsFromLines } = await import("./lib/invoice-totals-reader.mjs");
const { normalizeAzureInvoice } = await import("./workflows/invoiceFacts.v1.azure.mjs");
const line = (c,p)=>({content:c,polygon:p});
const A4={unit:"inch",width:8.2639,height:11.6806};
const byPath=(f)=>Object.fromEntries(f.map(x=>[x.field_path,x]));
const row=(label,val,y)=>[line(label,[5.0,y,6.0,y,6.0,y+0.15,5.0,y+0.15]), line(val,[6.5,y+0.01,6.9,y+0.01,6.9,y+0.14,6.5,y+0.14])];

console.log("--- K3: two DISTINCT printed Delivery RM10.00 rows collapse into one fact ---");
{
  const lines=[...row("Sub Total","100.00",8.0), ...row("Delivery","10.00",8.25), ...row("Delivery","10.00",8.5)];
  const {fields,receipt}=readTotalsFromLines([{pageNumber:1,lines,...A4}]);
  const d=byPath(fields)["invoice.delivery"];
  console.log(`  delivery emitted=${JSON.stringify(d?.value_raw ?? null)} occurrences=${receipt.fields["invoice.delivery"]?.occurrences} outcome=${receipt.fields["invoice.delivery"]?.outcome}`);
  console.log(`  -> ${d ? "REPRODUCED (two charges became one; 100+10=110 would tie a 110 gross)" : "FIXED"}`);
}

console.log("\n--- K4: an unbounded signed rounding balances an arbitrarily wrong gross ---");
{
  const lines=[...row("Sub Total","200.00",8.0),
    line("Rounding",[5.0,8.25,6.0,8.25,6.0,8.4,5.0,8.4]),
    line("-",[6.2,8.26,6.3,8.26,6.3,8.39,6.2,8.39]),
    line("100.00",[6.5,8.26,6.9,8.26,6.9,8.39,6.5,8.39])];
  const {fields,receipt}=readTotalsFromLines([{pageNumber:1,lines,...A4}]);
  const r=byPath(fields)["invoice.rounding"];
  console.log(`  rounding emitted=${JSON.stringify(r?.value_raw ?? null)} outcome=${receipt.fields["invoice.rounding"]?.outcome}`);
  console.log(`  -> ${r?.value_raw === "-100.00" ? "REPRODUCED (RM100 'rounding' certifies 200-100=100)" : "FIXED"}`);
}

console.log("\n--- K1 (runtime half): typed-only net/tax leave NO reader agreement in the receipt ---");
{
  const TOTAL={content:"100.00",valueCurrency:{currencyCode:"MYR"},boundingRegions:[{pageNumber:1,polygon:[0,0,1,0,1,1,0,1]}],confidence:0.5};
  const out=normalizeAzureInvoice({status:"succeeded",analyzeResult:{
    documents:[{fields:{InvoiceTotal:TOTAL,SubTotal:{content:"6.00",confidence:0.5},TotalTax:{content:"94.00",confidence:0.5}}}],
    pages:[{pageNumber:1,...A4,lines:[]}]}});
  const r=out.envelope.totals_reader;
  const net=byPath(out.fields)["invoice.total_excl_tax"], tax=byPath(out.fields)["invoice.tax_total"];
  console.log(`  net=${net?.value_raw} tax=${tax?.value_raw}  (transposed: the real bill is net 94 / tax 6)`);
  console.log(`  receipt.fields=${JSON.stringify(r.fields)}  typed_collapsed=${r.typed_collapsed}`);
  console.log(`  -> the DB predicate today sees 6+94=100 and corroborates with NO reader having read either field`);
}
