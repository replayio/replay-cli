import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checklist } from './Checklist';

const meta: Meta<typeof Checklist> = {
  title: 'Checklist',
  component: Checklist,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Checklist>;

export const Default: Story = {
  args: {
    initialItems: [
      { id: "1", text: "One", checked: true },
      { id: "2", text: "Two", checked: true },
      { id: "3", text: "Three", checked: true },
      { id: "4", text: "Four", checked: false },
      { id: "5", text: "Five", checked: true },
      { id: "6", text: "Six", checked: true },
      { id: "7", text: "Seven", checked: true },
    ],
    title: "My Custom Checklist",
  },
};

export const EmptyChecklist: Story = {
  args: {
    initialItems: [],
  },
};

export const AllChecked: Story = {
  args: {
    initialItems: [
      { id: "1", text: "Task One", checked: true },
      { id: "2", text: "Task Two", checked: true },
      { id: "3", text: "Task Three", checked: true },
    ],
    title: "Completed Tasks",
  },
};

export const AllUnchecked: Story = {
  args: {
    initialItems: [
      { id: "1", text: "Task One", checked: false },
      { id: "2", text: "Task Two", checked: false },
      { id: "3", text: "Task Three", checked: false },
    ],
    title: "Todo List",
  },
}; 