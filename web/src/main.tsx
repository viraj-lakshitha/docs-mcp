import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MotionConfig } from "motion/react";
import Landing from "./pages/Landing.tsx";
import Workspace from "./pages/Workspace.tsx";
import Login from "./pages/Login.tsx";
import Share from "./pages/Share.tsx";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* reducedMotion="user" makes every Motion animation in the app respect
        prefers-reduced-motion without each component opting in. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Workspace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/s/:token" element={<Share />} />
        </Routes>
      </BrowserRouter>
    </MotionConfig>
  </React.StrictMode>
);
