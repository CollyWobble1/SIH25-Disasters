import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./HomePage";
import SosPage from "./SosPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sos" element={<SosPage />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;