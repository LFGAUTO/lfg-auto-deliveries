import { useId } from 'react'
import { choiceKey, uniqueChoices } from '../lib/deliveryChoices'

export default function SavedChoice({label,value,onChange,options=[],type='text',placeholder}) {
 const id=useId()
 const choices=uniqueChoices(options)
 const match=choices.find(v=>choiceKey(v)===choiceKey(value))
 return <label className="fld" htmlFor={id}><span>{label}</span>
  <input id={id} aria-label={label} type={type} value={value??''}
    placeholder={placeholder||'Type any value or pick a saved choice below'}
    onChange={e=>onChange(e.target.value)} />
  <select aria-label={label+' saved choices'} value={match||''} onChange={e=>{
   if(e.target.value)onChange(e.target.value)
  }}>
   <option value="">Pick a saved choice…</option>
   {choices.map(v=><option key={choiceKey(v)} value={v}>{v}</option>)}
  </select>
 </label>
}
