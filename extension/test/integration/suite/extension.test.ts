import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";

interface FormattingResult {
  document: vscode.TextDocument;
  edits: readonly vscode.TextEdit[] | undefined;
}

async function formattingEdits(source: string): Promise<FormattingResult> {
  const document = await vscode.workspace.openTextDocument({
    language: "java",
    content: source
  });
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
    "vscode.executeFormatDocumentProvider",
    document.uri,
    { insertSpaces: true, tabSize: 4 }
  );
  return { document, edits };
}

function applyEdits(
  source: string,
  document: vscode.TextDocument,
  edits: readonly vscode.TextEdit[]
): string {
  return [...edits]
    .sort((left, right) => document.offsetAt(right.range.start) - document.offsetAt(left.range.start))
    .reduce((text, edit) => {
      const start = document.offsetAt(edit.range.start);
      const end = document.offsetAt(edit.range.end);
      return `${text.slice(0, start)}${edit.newText}${text.slice(end)}`;
    }, source);
}

suite("Palantir Java Format integration", () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension("lucasfleury.palantir-java-format");
    assert.ok(extension, "extension is installed in the development host");
    await extension.activate();
  });

  test("formats a complete Java document and fixes imports", async () => {
    const source =
      "import java.util.Set;\nimport java.util.ArrayList;\nimport java.util.List;\nclass Example{List<String> values=new ArrayList<>();}";
    const { document, edits } = await formattingEdits(source);
    assert.ok(edits && edits.length > 0);
    const formatted = applyEdits(source, document, edits);
    assert.ok(formatted.includes("class Example {"));
    assert.ok(formatted.indexOf("java.util.ArrayList") < formatted.indexOf("java.util.List"));
    assert.ok(!formatted.includes("java.util.Set"));
  });

  test("returns no change when already formatted", async () => {
    const { edits } = await formattingEdits("class Example {}\n");
    assert.ok(edits === undefined || edits.length === 0);
  });

  test("leaves invalid Java unchanged", async () => {
    const { edits } = await formattingEdits("class {");
    assert.ok(edits === undefined || edits.length === 0);
  });

  test("formats on save", async () => {
    const extension = vscode.extensions.getExtension("lucasfleury.palantir-java-format");
    assert.ok(extension);
    const directory = vscode.Uri.file(path.join(extension.extensionPath, ".integration-workspace"));
    const uri = vscode.Uri.joinPath(directory, "FormatOnSave.java");
    const editorConfig = vscode.workspace.getConfiguration("editor", {
      languageId: "java",
      uri
    });

    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(uri, Buffer.from("class FormatOnSave{}", "utf8"));
    await editorConfig.update(
      "defaultFormatter",
      "lucasfleury.palantir-java-format",
      vscode.ConfigurationTarget.Global,
      true
    );
    await editorConfig.update(
      "formatOnSave",
      true,
      vscode.ConfigurationTarget.Global,
      true
    );

    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      await editor.edit((builder) => builder.insert(document.positionAt(document.getText().length), " "));
      assert.ok(await document.save());
      const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      assert.strictEqual(document.getText(), `class FormatOnSave {}${eol}`);
    } finally {
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      await vscode.workspace.fs.delete(directory, { recursive: true, useTrash: false });
    }
  });
});
