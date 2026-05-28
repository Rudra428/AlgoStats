import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'
import Profile from './Profile';
function App() {
  const [count, setCount] = useState(0)

  return (
    <>
     <Profile/> 
    </>
  )
}

export default App
