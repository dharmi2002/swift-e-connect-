import { Smartphone, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const steps = [
  "Open your phone dialer and type *#06#",
  'If an "EID" number (32 digits) appears, your phone supports eSIM.',
  "iPhone: Settings → General → About → look for EID.",
  "Android: Settings → About phone → Status → EID.",
];

const supported = [
  "iPhone XS and newer",
  "Samsung Galaxy S20 and newer",
  "Google Pixel 3 and newer",
  "Huawei P40, Oppo Find X3, Motorola Razr",
];

export function CompatibilityDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 shrink-0 text-primary" />
            Is your phone eSIM compatible?
          </DialogTitle>
          <DialogDescription>Takes about 10 seconds to check.</DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-sm font-semibold">Commonly supported devices</p>
          <ul className="mt-2 space-y-1.5">
            {supported.map((device) => (
              <li key={device} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0">{device}</span>
              </li>
            ))}
          </ul>
        </div>

        <Button variant="hero" className="w-full" asChild>
          <a href="#plans">Browse eSIM plans</a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
