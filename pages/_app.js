import "../styles/globals.css";
import { CanvasProvider } from "../components/canvas/CanvasProvider";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function MyApp({ Component, pageProps }) {
  return (
    <ConvexProvider client={convex}>
      <CanvasProvider>
        <Component {...pageProps} />
      </CanvasProvider>
    </ConvexProvider>
  );
}
