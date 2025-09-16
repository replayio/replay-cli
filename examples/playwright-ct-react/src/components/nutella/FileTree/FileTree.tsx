import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { DocumentIcon, FolderIcon } from "@heroicons/react/24/solid";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

type Node = {
  name: string;
  nodes?: Node[];
};

export function FileTree({ node }: { node: Node }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <li key={node.name} data-testid={`file-tree-item-${node.name}`}>
      <span className="flex items-center gap-1.5 py-1">
        {node.nodes && node.nodes.length > 0 && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 -m-1"
            data-testid={`toggle-${node.name}`}
          >
            <motion.span
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="flex"
            >
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </motion.span>
          </button>
        )}

        {node.nodes ? (
          <FolderIcon
            className={`size-6 text-primary ${node.nodes.length === 0 ? "ml-[22px]" : ""}`}
          />
        ) : (
          <DocumentIcon className="ml-[22px] size-6 text-foreground" />
        )}
        {node.name}
      </span>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="pl-6 overflow-hidden flex flex-col justify-end"
            data-testid={`children-${node.name}`}
          >
            {node.nodes?.map(node => (
              <FileTree node={node} key={node.name} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export default FileTree;
