import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout.js";
import { Chat } from "./pages/Chat.js";
import { DocumentDetailPage } from "./pages/DocumentDetail.js";
import { Ingest } from "./pages/Ingest.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Chat />} />
          <Route path="razgovor/:id" element={<Chat />} />
          <Route path="dokumenti" element={<Ingest />} />
          <Route path="document/:id" element={<DocumentDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
