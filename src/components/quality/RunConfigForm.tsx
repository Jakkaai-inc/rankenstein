import type { ChecklistConfig } from "@/lib/run/checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectCls =
  "border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="border-input hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-4 accent-current" />
      <span>{label}</span>
    </label>
  );
}

export default function RunConfigForm({
  config,
  action,
}: {
  config: ChecklistConfig;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contentType" label="Content type">
          <select id="contentType" name="contentType" defaultValue={config.contentType} className={selectCls}>
            <option value="product">Product rewrite</option>
            <option value="article">Article</option>
          </select>
        </Field>
        <Field id="goal" label="Goal">
          <select id="goal" name="goal" defaultValue={config.goal} className={selectCls}>
            <option value="improve_product">Improve product content</option>
            <option value="new_articles">New articles</option>
            <option value="update_articles">Update articles</option>
          </select>
        </Field>
        <Field id="depth" label="Depth">
          <select id="depth" name="depth" defaultValue={config.depth} className={selectCls}>
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </Field>
        <Field id="readability" label="Readability">
          <select id="readability" name="readability" defaultValue={config.readability} className={selectCls}>
            <option value="simple">Simple</option>
            <option value="standard">Standard</option>
            <option value="technical">Technical</option>
          </select>
        </Field>
        <Field id="groundedness" label="Groundedness">
          <select id="groundedness" name="groundedness" defaultValue={config.groundedness} className={selectCls}>
            <option value="strict">Strict</option>
            <option value="balanced">Balanced</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Pipeline layers</Label>
          <div className="grid gap-2">
            <Toggle name="layer_angle" label="Angle discovery (articles)" checked={config.layers.angle} />
            <Toggle name="layer_aeo" label="AEO optimization" checked={config.layers.aeo} />
            <Toggle name="layer_citationVerify" label="Citation verifier" checked={config.layers.citationVerify} />
            <Toggle name="layer_imageGen" label="Image generation" checked={config.layers.imageGen} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Quality elements</Label>
          <div className="grid gap-2">
            <Toggle name="q_tables" label="Spec tables" checked={config.quality.tables} />
            <Toggle name="q_quotes" label="Quotes" checked={config.quality.quotes} />
            <Toggle name="q_kpiChips" label="KPI chips" checked={config.quality.kpiChips} />
            <Toggle name="q_charts" label="Charts" checked={config.quality.charts} />
            <Toggle name="q_images" label="Images" checked={config.quality.images} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="perPieceTokenCeiling" label="Per-piece token ceiling">
          <Input
            id="perPieceTokenCeiling"
            name="perPieceTokenCeiling"
            type="number"
            min={1000}
            step={1000}
            defaultValue={config.perPieceTokenCeiling}
          />
        </Field>
        <Field id="runSpendSoftStopUsd" label="Run spend soft-stop (USD)">
          <Input
            id="runSpendSoftStopUsd"
            name="runSpendSoftStopUsd"
            type="number"
            min={1}
            step={1}
            defaultValue={config.runSpendSoftStopUsd}
          />
        </Field>
      </div>

      <Button type="submit">Save quality goal</Button>
    </form>
  );
}
