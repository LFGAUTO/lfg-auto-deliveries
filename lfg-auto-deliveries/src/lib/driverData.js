import { supabase } from './supabase'
// The server determines identity and ownership. Caller-supplied names are never trusted.
export const driverRequest = payload => supabase.rpc('driver_portal', {payload})
export const driverData = {from(table) {
 let op='select', values, id, status, single=false
 const query={
  select(){return query},order(){return query},or(){return query},
  update(v){op='update';values=v;return query},insert(v){op='insert';values=v;return query},
  eq(k,v){if(k==='id')id=v;if(k==='status')status=v;return query},
  single(){single=true;return query},
  then(ok,bad){return driverRequest({table,op,values,id,status}).then(r=>({data:r.data,error:r.error})).then(ok,bad)},
 }
 return query
}}
