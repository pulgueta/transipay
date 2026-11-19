import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterSelectItem {
  value: string;
  label: string;
}

interface FilterSelectProps {
  id: string;
  label: string;
  items: readonly FilterSelectItem[];
  value: string;
  onValueChange: (value: string) => void;
}

/** A small select that filters a staff list. */
export const FilterSelect = ({
  id,
  label,
  items,
  value,
  onValueChange,
}: FilterSelectProps) => (
  <div className="flex items-center gap-2">
    <Label htmlFor={id}>{label}</Label>
    {/* With `items`, the trigger shows the label of the value, not the value. */}
    <Select
      items={items}
      onValueChange={(next) => {
        if (next !== null) {
          onValueChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger className="w-44" id={id} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);
