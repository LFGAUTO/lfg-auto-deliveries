import { useEffect, useId, useRef, useState } from 'react'
import { choiceKey, uniqueChoices } from '../lib/deliveryChoices'

// One visible value control: a dropdown, or a write-in input in its place.
export default function SavedChoice({label,value,onChange,options=[],type='text',placeholder}) {
 const id=useId(), input=useRef(null)
 const [writing,setWriting]=useState(false)
 const choices=uniqueChoices([value,...options])
 const match=choices.find(v=>choiceKey(v)===choiceKey(value))
 const writeIn='__write_in_'+id
 useEffect(()=>{if(writing){input.current?.focus();input.current?.select()}},[writing])
 return <div className="saved-choice">
  <label className="fld" htmlFor={id}><span>{label}</span>
   {writing ? <input ref={input} id={id} aria-label={label} type={type} value={value??''}
    placeholder={placeholder||'Type a new value'} onChange={e=>onChange(e.target.value)} />
    : <select id={id} aria-label={label} value={match||''} onChange={e=>{
      if(e.target.value===writeIn)setWriting(true)
      else onChange(e.target.value)
     }}>
      <option value="">— Choose —</option>
      {choices.map(v=><option key={choiceKey(v)} value={v}>{v}</option>)}
      <option value={writeIn}>+ Type a new value…</option>
     </select>}
  </label>
  {writing&&<button type="button" aria-label={'Show saved choices for '+label} onClick={()=>setWriting(false)}
   style={{background:'transparent',border:0,color:'var(--gold)',padding:0,marginTop:-6,marginBottom:12,cursor:'pointer',fontSize:12}}>Use dropdown</button>}
 </div>
}
