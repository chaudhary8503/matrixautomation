import { Link } from "react-router";
import { useSeo } from "@/hooks/use-seo";

export default function NotFound() {
  useSeo({ title: "Page not found", noindex: true });
  return (
    <section className="py-32" data-not-found="">
      <div className="container max-w-xl px-4 text-center">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mb-4 mt-2 text-3xl font-black sm:text-4xl">Page not found</h1>
        <p className="mb-8 text-muted-foreground">The page you're looking for doesn't exist or has moved.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="glow-button rounded-lg px-6 py-3 text-sm">
            Go home
          </Link>
          <Link to="/products" className="glow-button-outline rounded-lg px-6 py-3 text-sm">
            Browse products
          </Link>
        </div>
      </div>
    </section>
  );
}
