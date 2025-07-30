import type { Meta, StoryObj } from '@storybook/react-vite';
import Tabs from './Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="p-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  args: {
    tabs: [
      { id: "world", label: "World" },
      { id: "ny", label: "N.Y." },
      { id: "business", label: "Business" },
      { id: "arts", label: "Arts" },
      { id: "science", label: "Science" },
    ],
  },
};

export const FewTabs: Story = {
  args: {
    tabs: [
      { id: "home", label: "Home" },
      { id: "about", label: "About" },
      { id: "contact", label: "Contact" },
    ],
  },
};

export const TwoTabs: Story = {
  args: {
    tabs: [
      { id: "login", label: "Login" },
      { id: "signup", label: "Sign Up" },
    ],
  },
}; 