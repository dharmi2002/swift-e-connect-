import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BusinessDashboardShell } from "@/components/business/BusinessDashboardShell";
import { StripePaymentForm } from "@/components/store/StripePaymentForm";
import { packagesQuery, formatData, formatUsd, type Package } from "@/lib/packages";
import { listEmployees } from "@/services/organization.server";
import { createBulkPaymentIntent } from "@/services/payment.server";
import { purchaseBulkSeats, listSeats, assignSeat, type SeatRow } from "@/services/bulk.server";

export const Route = createFileRoute("/business/bulk")({
  head: () => ({ meta: [{ title: "Bulk packages — PassportSIM Business" }] }),
  component: () => (
    <BusinessDashboardShell>
      <BulkPage />
    </BusinessDashboardShell>
  ),
});

function BulkPage() {
  const queryClient = useQueryClient();
  const [pkg, setPkg] = useState<Package | null>(null);
  const [quantity, setQuantity] = useState(5);
  const [showPayment, setShowPayment] = useState(false);
  const [assignSeatRow, setAssignSeatRow] = useState<SeatRow | null>(null);

  const packagesQ = useQuery(packagesQuery);
  const seatsQuery = useQuery({ queryKey: ["business-seats"], queryFn: () => listSeats() });

  const purchase = useMutation({
    mutationFn: (stripePaymentIntentId: string) => {
      if (!pkg) throw new Error("No plan selected");
      return purchaseBulkSeats({
        data: { packageCode: pkg.code, quantity, stripePaymentIntentId },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["business-seats"] });
      toast.success(`Purchased ${res.quantity} seats`);
      setPkg(null);
      setShowPayment(false);
      setQuantity(5);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Purchase failed"),
  });

  const seats = seatsQuery.data ?? [];
  const unassignedCount = seats.filter((s) => s.status === "unassigned").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Bulk packages</h1>
        <p className="text-sm text-muted-foreground">
          Pay once for a batch of eSIMs, then hand them out to employees or any email whenever
          you're ready.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buy seats</CardTitle>
          <CardDescription>Pick a plan and how many eSIMs you need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showPayment && pkg ? (
            <StripePaymentForm
              packageCode={pkg.code}
              amountUsd={pkg.retail_price_usd * quantity}
              onBack={() => setShowPayment(false)}
              onPaid={(id) => purchase.mutate(id)}
              createIntent={() =>
                createBulkPaymentIntent({ data: { packageCode: pkg.code, quantity } })
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select
                  value={pkg?.code ?? ""}
                  onValueChange={(code) =>
                    setPkg((packagesQ.data ?? []).find((p) => p.code === code) ?? null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {(packagesQ.data ?? []).map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.flag_emoji} {p.location_name} · {formatData(p.data_mb)} /{" "}
                        {p.validity_days}d — {formatUsd(p.retail_price_usd)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantity</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="w-24 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((q) => Math.min(500, q + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {pkg && (
                <p className="text-sm text-muted-foreground">
                  Total:{" "}
                  <span className="font-bold text-foreground">
                    {formatUsd(pkg.retail_price_usd * quantity)}
                  </span>{" "}
                  for {quantity} eSIM{quantity === 1 ? "" : "s"}
                </p>
              )}

              <Button variant="hero" disabled={!pkg} onClick={() => setShowPayment(true)}>
                Continue to payment
              </Button>
            </>
          )}

          {purchase.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Recording your purchase…
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Your seats</h2>
          <Badge variant="secondary">{unassignedCount} unassigned</Badge>
        </div>

        {seatsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : seats.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center text-sm text-muted-foreground">
            No bulk purchases yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seats.map((seat) => (
                  <TableRow key={seat.id}>
                    <TableCell className="font-medium">{seat.packageName}</TableCell>
                    <TableCell>{new Date(seat.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{seat.assignedEmployeeName ?? seat.assignedEmail ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={seat.status === "assigned" ? "default" : "outline"}>
                        {seat.status === "assigned"
                          ? (seat.orderStatus ?? "assigned")
                          : "unassigned"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {seat.status === "unassigned" && (
                        <Button size="sm" variant="outline" onClick={() => setAssignSeatRow(seat)}>
                          Assign
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AssignSeatDialog
        seat={assignSeatRow}
        onOpenChange={(open) => !open && setAssignSeatRow(null)}
      />
    </div>
  );
}

const ONE_OFF_VALUE = "__one_off__";

function AssignSeatDialog({
  seat,
  onOpenChange,
}: {
  seat: SeatRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string>("");
  const [oneOffEmail, setOneOffEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: ["business-employees"],
    queryFn: () => listEmployees(),
    enabled: !!seat,
  });

  const reset = () => {
    setEmployeeId("");
    setOneOffEmail("");
    setError(null);
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!seat) throw new Error("No seat selected");
      if (employeeId === ONE_OFF_VALUE) {
        if (!oneOffEmail.trim()) throw new Error("Enter a recipient email");
        return assignSeat({ data: { seatId: seat.id, recipientEmail: oneOffEmail.trim() } });
      }
      if (!employeeId) throw new Error("Choose an employee or a one-off email");
      return assignSeat({ data: { seatId: seat.id, employeeId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-seats"] });
      queryClient.invalidateQueries({ queryKey: ["business-employees"] });
      toast.success("Seat assigned — eSIM is on its way");
      reset();
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to assign seat"),
  });

  return (
    <Dialog
      open={!!seat}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign this seat</DialogTitle>
          <DialogDescription>
            {seat?.packageName} — pick an employee or send it to any email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Recipient</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an employee" />
            </SelectTrigger>
            <SelectContent>
              {(employeesQuery.data ?? []).map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.fullName} ({employee.email})
                </SelectItem>
              ))}
              <SelectItem value={ONE_OFF_VALUE}>+ Send to a one-off email</SelectItem>
            </SelectContent>
          </Select>
          {employeeId === ONE_OFF_VALUE && (
            <Input
              type="email"
              autoFocus
              placeholder="name@example.com"
              value={oneOffEmail}
              onChange={(e) => setOneOffEmail(e.target.value)}
            />
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="hero" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Assign seat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
