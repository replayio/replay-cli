import type { Meta, StoryObj } from '@storybook/react-vite';
import Header from './Header';

const meta: Meta<typeof Header> = {
  title: 'MarketingHeader',
  component: Header,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {}; 