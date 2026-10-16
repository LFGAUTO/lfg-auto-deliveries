import { useState } from 'react'
import { cleanChoice, choiceKey, uniqueChoices } from '../lib/deliveryChoices'

export default function SavedChoice({label,value,onChange,options=[],type='text',placeholder}) {
 const [typing,setTyping]=useState(false)
 const choices=uniqueChoices(options)
 const match=choices.find(v=>choiceKey(v)===choiceKey(value))
 const custom=typing||!!cleanChoice(value)&&!match
 return <label className="fld"><span>{label}</span>
  <select aria-label={label+' saved choices'} value={custom?'__custom__':match||''} onChange={e=>{
   if(e.target.value==='__custom__'){setTyping(true)}else{setTyping(false);onChange(e.target.value)}
  }}>
   <option value="">— Choose —</option>
   {choices.map(v=><option key={choiceKey(v)} value={v}>{v}</option>)}
   <option value="__custom__">+ Add new / type or edit</option>
  </select>
  {custom&&<input aria-label={label} type={type} value={value??''} placeholder={placeholder||'Type a new value'} onChange={e=>{setTyping(true);onChange(e.target.value)}} />}
 </label>
}
