import './style.css'

import Navbar from '.componets/navbar'
import Home from '.componets/home'
import Work from '.componets/work'
import Post from '.componets/post'
import Uses from '.componets/uses'
import Skills from '.componets/skills'
import Links from '.componets/links'

function App() {
    return (
        <main className = "text-gray-400 bg-gray-900 body-font">
            <Navbar />
            <Home />
            <Work />
            <Post />
            <Uses />
            <Skills />
            <Links />
        </main>
    );
}

export default App
