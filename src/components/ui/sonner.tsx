import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors
      toastOptions={{ classNames: { toast: "font-sans" } }}
      {...props}
    />
  );
}

export { Toaster };
