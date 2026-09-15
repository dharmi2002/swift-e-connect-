import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  listEmployees,
  listOffices,
  createEmployee,
  createOffice,
  removeEmployee,
  type EmployeeReportRow,
} from "@/services/organization.server";
import { purchaseForEmployee } from "@/services/order.server";

export const Route = createFileRoute("/business/employees")({
  head: () => ({ meta: [{ title: "Employees — PassportSIM Business" }] }),
  component: () => (
    <BusinessDashboardShell>
      <EmployeesReport />
    </BusinessDashboardShell>
  ),
});

const statusMeta: Record<
  EmployeeReportRow["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  no_plan: { label: "No plan", variant: "outline" },
  processing: { label: "Provisioning…", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  active: { label: "Active", variant: "default" },
  expiring_soon: { label: "Expiring soon", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
};

function EmployeesReport() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [buyFor, setBuyFor] = useState<EmployeeReportRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EmployeeReportRow | null>(null);

  const employeesQuery = useQuery({
    queryKey: ["business-employees"],
    queryFn: () => listEmployees(),
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.status === "processing") ? 3000 : false,
  });

  const removeMutation = useMutation({
    mutationFn: (employeeId: string) => removeEmployee({ data: { employeeId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-employees"] });
      toast.success("Employee removed");
      setRemoveTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to remove employee"),
  });

  const employees = employeesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Add employees, buy them an eSIM plan, and track when it expires.
          </p>
        </div>
        <Button variant="hero" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add employee
        </Button>
      </div>

      {employeesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : employees.length === 0 ? (
        <div className="rounded-2xl border p-10 text-center text-sm text-muted-foreground">
          No employees yet — add your first one to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Current plan</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.fullName}</TableCell>
                  <TableCell>{employee.officeName ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{employee.email}</div>
                    {employee.phone && (
                      <div className="text-xs text-muted-foreground">{employee.phone}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {employee.plan
                      ? `${employee.plan.packageName} · ${formatData(employee.plan.dataMb)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {employee.plan?.expiresAt
                      ? new Date(employee.plan.expiresAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusMeta[employee.status].variant}>
                      {statusMeta[employee.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setBuyFor(employee)}>
                        Buy eSIM
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(employee)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
      <BuyEsimDialog employee={buyFor} onOpenChange={(open) => !open && setBuyFor(null)} />

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This hides them from your roster. Any eSIM already issued to them keeps working — it
              just won't show up here anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMutation.isPending}
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.id)}
            >
              {removeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const NEW_OFFICE_VALUE = "__new_office__";

function AddEmployeeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [officeId, setOfficeId] = useState<string>("");
  const [newOfficeName, setNewOfficeName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const officesQuery = useQuery({
    queryKey: ["business-offices"],
    queryFn: () => listOffices(),
    enabled: open,
  });

  const reset = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setOfficeId("");
    setNewOfficeName("");
    setError(null);
  };

  const submit = useMutation({
    mutationFn: async () => {
      let resolvedOfficeId = officeId || null;
      if (officeId === NEW_OFFICE_VALUE) {
        if (!newOfficeName.trim()) throw new Error("Enter a name for the new office");
        const office = await createOffice({ data: { name: newOfficeName.trim() } });
        resolvedOfficeId = office.id;
      }
      return createEmployee({
        data: { fullName, email, phone: phone || undefined, officeId: resolvedOfficeId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-employees"] });
      queryClient.invalidateQueries({ queryKey: ["business-offices"] });
      toast.success("Employee added");
      reset();
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to add employee"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>
            They'll receive their eSIM QR code by email once purchased.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="emp-name">Full name</Label>
            <Input id="emp-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-email">Email</Label>
            <Input
              id="emp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-phone">Phone (optional)</Label>
            <Input id="emp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Office (optional)</Label>
            <Select value={officeId} onValueChange={setOfficeId}>
              <SelectTrigger>
                <SelectValue placeholder="No office" />
              </SelectTrigger>
              <SelectContent>
                {(officesQuery.data ?? []).map((office) => (
                  <SelectItem key={office.id} value={office.id}>
                    {office.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_OFFICE_VALUE}>+ Add a new office</SelectItem>
              </SelectContent>
            </Select>
            {officeId === NEW_OFFICE_VALUE && (
              <Input
                autoFocus
                placeholder="Office name"
                value={newOfficeName}
                onChange={(e) => setNewOfficeName(e.target.value)}
              />
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="submit" variant="hero" disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add employee
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BuyEsimDialog({
  employee,
  onOpenChange,
}: {
  employee: EmployeeReportRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  const packagesQ = useQuery(packagesQuery);

  const purchase = useMutation({
    mutationFn: (stripePaymentIntentId: string) => {
      if (!employee || !selectedPackage) throw new Error("Nothing selected");
      return purchaseForEmployee({
        data: {
          employeeId: employee.id,
          packageCode: selectedPackage.code,
          stripePaymentIntentId,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-employees"] });
      toast.success(`eSIM purchase started for ${employee?.fullName}`);
      close();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Purchase failed"),
  });

  const close = () => {
    setSelectedPackage(null);
    setShowPayment(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!employee} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buy an eSIM for {employee?.fullName}</DialogTitle>
          <DialogDescription>
            Delivered straight to {employee?.email} once payment succeeds.
          </DialogDescription>
        </DialogHeader>

        {showPayment && selectedPackage ? (
          <StripePaymentForm
            packageCode={selectedPackage.code}
            amountUsd={selectedPackage.retail_price_usd}
            onBack={() => setShowPayment(false)}
            onPaid={(id) => purchase.mutate(id)}
          />
        ) : (
          <div className="space-y-3">
            <Label>Choose a plan</Label>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(packagesQ.data ?? []).map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackage(pkg)}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    selectedPackage?.id === pkg.id ? "border-primary bg-accent" : "hover:bg-muted"
                  }`}
                >
                  <span className="text-xl">{pkg.flag_emoji}</span>
                  <span className="min-w-0 truncate text-sm font-medium">
                    {pkg.location_name} · {formatData(pkg.data_mb)} / {pkg.validity_days}d
                  </span>
                  <span className="shrink-0 text-sm font-bold">
                    {formatUsd(pkg.retail_price_usd)}
                  </span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button
                variant="hero"
                disabled={!selectedPackage}
                onClick={() => setShowPayment(true)}
              >
                Continue to payment
              </Button>
            </DialogFooter>
          </div>
        )}

        {purchase.isPending && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Starting provisioning…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
