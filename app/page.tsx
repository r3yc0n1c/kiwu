import Image from "next/image";
import Logo from "../public/logo-512x512-transparent.png";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-background text-foreground">
      <div className="flex gap-2 items-center">
        <h1 className="text-4xl font-bold tracking-tight font-heading">kiwu</h1>
        <Image alt="logo" src={Logo} className="invert object-cover" width={64} />
      </div>
      <p className="mt-4 text-muted-foreground">Cognitive offloading, instant.</p>
    </main>
  );
}
