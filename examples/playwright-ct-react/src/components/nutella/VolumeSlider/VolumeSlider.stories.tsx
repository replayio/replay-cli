import type { Meta, StoryObj } from '@storybook/react-vite';
import { VolumeSlider } from './VolumeSlider';

const meta: Meta<typeof VolumeSlider> = {
  title: 'VolumeSlider',
  component: VolumeSlider,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div className="w-96 p-12 bg-muted rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof VolumeSlider>;

export const Default: Story = {};

export const WithInteraction: Story = {
  play: async () => {
    // Story for testing interactions
  },
}; 