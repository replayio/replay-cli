import { program } from "commander";
import strip from "strip-ansi";
import { formatOutput } from "./formatOutput";
import { registerCommand } from "./registerCommand";

function addTestCommand(name: string) {
  return registerCommand(name).action(() => {});
}

describe("commander", () => {
  describe("formatOutput", () => {
    beforeAll(() => {
      addTestCommand("command-one").description("This command has no arguments or options");
      addTestCommand("command-two")
        .description("This command has one option and one optional argument")
        .option("-o, --optional", "An optional flag")
        .argument("[optional]", "An optional argument");
      addTestCommand("command-three")
        .description("This command has options and a required argument")
        .option("-o, --optional", "An optional flag")
        .option("--optional-two", "Another optional flag", true)
        .option("-z", "Short flag only", false)
        .argument("<required>", "A required argument");
      addTestCommand("command-four")
        .description("This command required arguments")
        .argument("[optional]", "An optional argument")
        .argument("<required...>", "A required argument");
    });

    it("should gracefully handle empty or short strings", () => {
      expect(formatOutput("")).toBe("");
      expect(formatOutput("Single line")).toBe("Single line");
    });

    it("should format the command directory", () => {
      const text = program.helpInformation();
      const formatted = formatOutput(text);

      expect(strip(formatted)).toMatchInlineSnapshot(`
        "Usage:  [options] [command]

        ┌ Options ──────────────────────────────────────────────────────────┐
        │  -h, --help                             display help for command  │
        └───────────────────────────────────────────────────────────────────┘

        ┌ Commands ──────────────────────────────────────────────────────────────────────────────────────┐
        │  command-one                            This command has no arguments or options               │
        │  command-two [options] [optional]       This command has one option and one optional argument  │
        │  command-three [options] <required>     This command has options and a required argument       │
        │  command-four [optional] <required...>  This command required arguments                        │
        │  help [command]                         display help for command                               │
        └────────────────────────────────────────────────────────────────────────────────────────────────┘
        "
      `);
    });

    it("should format a command with no arguments or options", () => {
      const text = program.commands[0].helpInformation();
      const formatted = formatOutput(text);

      expect(strip(formatted)).toMatchInlineSnapshot(`
        "Usage:  command-one [options]

        This command has no arguments or options

        ┌ Options ───────────────────────────────┐
        │  -h, --help  display help for command  │
        └────────────────────────────────────────┘
        "
      `);
    });

    it("should format a command with options and an optional argument", () => {
      const text = program.commands[1].helpInformation();
      const formatted = formatOutput(text);

      expect(strip(formatted)).toMatchInlineSnapshot(`
        "Usage:  command-two [options] [optional]

        This command has one option and one optional argument

        ┌ Arguments ─────────────────────────────┐
        │  optional        An optional argument  │
        └────────────────────────────────────────┘

        ┌ Options ───────────────────────────────────┐
        │  -o, --optional  An optional flag          │
        │  -h, --help      display help for command  │
        └────────────────────────────────────────────┘
        "
      `);
    });

    it("should format a command with options and a required argument", () => {
      const text = program.commands[2].helpInformation();
      const formatted = formatOutput(text);

      expect(strip(formatted)).toMatchInlineSnapshot(`
        "Usage:  command-three [options] <required>

        This command has options and a required argument

        ┌ Arguments ────────────────────────────┐
        │  required        A required argument  │
        └───────────────────────────────────────┘

        ┌ Options ────────────────────────────────────────────────┐
        │  -o, --optional  An optional flag                       │
        │  --optional-two  Another optional flag (default: true)  │
        │  -z              Short flag only (default: false)       │
        │  -h, --help      display help for command               │
        └─────────────────────────────────────────────────────────┘
        "
      `);
    });

    it("should format a command with a required argument array", () => {
      const text = program.commands[3].helpInformation();
      const formatted = formatOutput(text);

      expect(strip(formatted)).toMatchInlineSnapshot(`
        "Usage:  command-four [options] [optional] <required...>

        This command required arguments

        ┌ Arguments ─────────────────────────┐
        │  optional    An optional argument  │
        │  required    A required argument   │
        └────────────────────────────────────┘

        ┌ Options ───────────────────────────────┐
        │  -h, --help  display help for command  │
        └────────────────────────────────────────┘
        "
      `);
    });
  });
});
