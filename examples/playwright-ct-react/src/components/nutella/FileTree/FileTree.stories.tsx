import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileTree } from "./FileTree";

type Node = {
  name: string;
  nodes?: Node[];
};

const sampleNodes: Node[] = [
  {
    name: "Home",
    nodes: [
      {
        name: "Movies",
        nodes: [
          {
            name: "Action",
            nodes: [
              {
                name: "2000s",
                nodes: [{ name: "Gladiator.mp4" }, { name: "The-Dark-Knight.mp4" }],
              },
              { name: "2010s", nodes: [] },
            ],
          },
          {
            name: "Comedy",
            nodes: [{ name: "2000s", nodes: [{ name: "Superbad.mp4" }] }],
          },
        ],
      },
      {
        name: "Music",
        nodes: [
          { name: "Rock", nodes: [] },
          { name: "Classical", nodes: [] },
        ],
      },
      { name: "Pictures", nodes: [] },
      { name: "passwords.txt" },
    ],
  },
];

const meta: Meta<typeof FileTree> = {
  title: "FileTree",
  component: FileTree,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof FileTree>;

export const Default: Story = {
  render: () => (
    <ul>
      {sampleNodes.map(node => (
        <FileTree node={node} key={node.name} />
      ))}
    </ul>
  ),
};

export const SingleFolder: Story = {
  args: {
    node: {
      name: "Documents",
      nodes: [{ name: "resume.pdf" }, { name: "cover-letter.docx" }],
    },
  },
  render: args => (
    <ul>
      <FileTree {...args} />
    </ul>
  ),
};

export const SingleFile: Story = {
  args: {
    node: {
      name: "readme.txt",
    },
  },
  render: args => (
    <ul>
      <FileTree {...args} />
    </ul>
  ),
};
