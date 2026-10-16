export const cleanChoice = value => String(value ?? '').trim().replace(/\s+/g, ' ')
export const choiceKey = value => cleanChoice(value).toLowerCase()
// Match only known spelling/order variants from this delivery history.
export function dealerKey(value) {
 return choiceKey(value).replace(/\bbirdgewater\b/g,'bridgewater').replace(/\bacadamy\b/g,'academy').replace(/\binfintii\b/g,'infiniti').replace(/\bsmiithtown\b/g,'smithtown').replace(/\bbayridge\b/g,'bay ridge').replace(/^dch /,'').split(' ').sort().join(' ')
}
export function uniqueChoices(values) {
 const seen=new Map()
 for(const value of values){const v=cleanChoice(value);if(v&&!seen.has(choiceKey(v)))seen.set(choiceKey(v),v)}
 return [...seen.values()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}))
}
export function compileDeliveryChoices(rows) {
 const dealers=new Map()
 for(const r of rows){const name=cleanChoice(r.dealership_name);if(!name)continue;const key=dealerKey(name);if(!dealers.has(key))dealers.set(key,{name,rows:[]});dealers.get(key).rows.push(r)}
 const groups=[...dealers.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'}))
 return {
  dealers:groups,
  dealer(name){return dealers.get(dealerKey(name))},
  values(field,filter=()=>true){return uniqueChoices(rows.filter(filter).map(r=>r[field]))},
 }
}
export const CHOICE_COLUMNS='id,created_at,dealership_name,dealership_address,dealership_contact,dealership_phone,make,model,color,vyear,miles_per_year,contract_type,cust_window_text,return_plan,trade_make,trade_model,trade_year,trade_return_dealer,pay_amount'
export async function loadDeliveryChoices(db) {
 const rows=[];const size=1000
 for(let start=0;;start+=size){
  const {data,error}=await db.from('deliveries').select(CHOICE_COLUMNS).order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+size-1)
  if(error)throw error
  rows.push(...(data||[]));if(!data||data.length<size)break
 }
 return compileDeliveryChoices(rows)
}
export function selectDealer(form,name,choices){
 if(dealerKey(name)===dealerKey(form.dealership_name))return {...form,dealership_name:name}
 const rows=choices.dealer(name)?.rows||[]
 const addresses=uniqueChoices(rows.map(r=>r.dealership_address)),contacts=uniqueChoices(rows.map(r=>r.dealership_contact))
 return {...form,dealership_name:name,dealership_address:addresses.length===1?addresses[0]:'',dealership_contact:contacts.length===1?contacts[0]:''}
}
