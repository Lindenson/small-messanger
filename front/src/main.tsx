import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import {webRTCService} from '@/features/call/service/webRTCService';
import { configureAppStore } from "./store/store";


import "@/index.css";
import "@/shared/i18n";
import App from "./app/App.tsx";

const store = configureAppStore(webRTCService);

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </StrictMode>
);
