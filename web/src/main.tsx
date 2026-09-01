import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing.tsx";
import Workspace from "./pages/Workspace.tsx";
import Login from "./pages/Login.tsx";
import Share from "./pages/Share.tsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
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
