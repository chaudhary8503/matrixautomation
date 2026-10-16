import { Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { PageFallback } from "@/components/layout/PageFallback";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { SnapshotEntrance } from "@/components/layout/SnapshotEntrance";
import { queryClient } from "@/lib/query-client";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { AdminApp, BrandDetail, Brands, Contact, Industries, ProductDetail, Products, WhoWeAre } from "@/routes";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* `m` components + the small domAnimation feature set; honours "reduce motion" settings. */}
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <BrowserRouter>
            <ScrollToTop />
            <SnapshotEntrance>
              {/* Public pages have their own Suspense inside the layout, so the header and footer stay put. */}
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route element={<PublicLayout />}>
                    <Route index element={<Home />} />
                    <Route path="who-we-are" element={<WhoWeAre />} />
                    <Route path="products" element={<Products />} />
                    <Route path="products/:slug" element={<ProductDetail />} />
                    <Route path="brands" element={<Brands />} />
                    <Route path="brands/:slug" element={<BrandDetail />} />
                    <Route path="industries" element={<Industries />} />
                    <Route path="contact" element={<Contact />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route path="admin/*" element={<AdminApp />} />
                </Routes>
              </Suspense>
            </SnapshotEntrance>
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
      <Toaster />
    </QueryClientProvider>
  );
}
