import {
  CircleIcon,
  QuestionMarkCircledIcon,
  StopwatchIcon,
} from "@radix-ui/react-icons";

export const statuses = [
  {
    value: "ACTIVE",
    label: "Active",
    icon: QuestionMarkCircledIcon,
  },
  {
    value: "INACTIVE",
    label: "Lost", // OKR Hub fork (OKR-171): INACTIVE = lost
    icon: CircleIcon,
  },
  {
    value: "PENDING",
    label: "Pending",
    icon: CircleIcon,
  },
  {
    value: "CLOSED",
    label: "Won", // OKR Hub fork (OKR-171): CLOSED = won
    icon: StopwatchIcon,
  },
];
