import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Workspace from "./pages/Workspace.jsx";
import Login from "./pages/Login.jsx";
import Share from "./pages/Share.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<Workspace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/s/:token" element={<Share />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
