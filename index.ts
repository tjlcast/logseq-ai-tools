import "@logseq/libs";
import { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

let statement = "hello world";

function getStatement() {
  fetch("https://v1.hitokoto.cn")
    .then((response) => response.json())
    .then((data) => {
      statement = data.hitokoto;
    })
    .catch(console.error);
}

/**
 *
 * @param input extractTags("Hello, #[[world]]! Welcome to #[[logseq]].")
 * @returns
 */
function extractTags(input: string): string[] {
  // 定义正则表达式匹配 #[[***]] 格式
  const tagPattern = /(#\[\[.*?\]\])/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  // 使用正则表达式循环匹配
  while ((match = tagPattern.exec(input)) !== null) {
    matches.push(match[1]); // 提取括号内的内容
  }

  return matches;
}

/**
 * 替换模板中的占位符
 * @param template, For example: "Hello, ${name}! Welcome to ${place}."
 * @param params
 * @returns
 */
function replacePlaceholders(
  template: string,
  params: Record<string, string>
): string {
  // 使用正则表达式匹配占位符，例如 ${name}
  return template.replace(/\$\{(\w+)\}/g, (match, key) => {
    // 如果 params 中有对应的 key，则替换，否则保留原占位符
    return params[key] !== undefined ? params[key] : match;
  });
}

function getContentFromBlockTree(block: BlockEntity | null) {
  var content = preOrderTraversal(block);
  if (content) {
    return content.trim();
  }
  return content;
}

// 实现一个函数先序遍历BlockTree，获取所有的content
function preOrderTraversal(block: BlockEntity | null) {
  var content = "";
  if (block === null || block === undefined) {
    return content;
  }
  const blockContent = block?.content?.trim();
  if (blockContent) {
    content += blockContent.padStart(
      (block.level || 0) * 4 + blockContent?.length,
      " "
    );
  }
  if (block.children) {
    block.children.forEach((child) => {
      if ((child as BlockEntity).content === undefined) return;
      content += preOrderTraversal(child as BlockEntity);
    });
  }
  return content;
}

/**
 * 调用AI接口
 * @param template, use ${} to holdplace.
 * @param params
 * @param url
 * @param key
 * @returns
 */
async function queryAi(
  template: string,
  params: any,
  url: string | null = null,
  key: string | null = null
): Promise<string | null | undefined> {
  let userContent = replacePlaceholders(template, params);
  try {
    url = url || "http://127.0.0.1:9966/v1/chat/completions";
    key = key || "xxxx";
    const headers = {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    };
    const body = JSON.stringify({
      messages: [
        {
          content: userContent,
          role: "user",
        },
      ],
      stream: false,
      temperature: 0,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: body,
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    await logseq.UI.showMsg(error.message, "error");
  }
}

async function main() {
  const schema: Array<any> = [
    {
      key: "ai-address",
      type: "string",
      default: "http://127.0.0.1:9966",
      title: "模板",
      description: "大模型的服务地址",
    },
    {
      key: "ai-endpoint",
      type: "string",
      default: "/v1/chat/completions",
      title: "模板",
      description: "大模型的请求url",
    },
    {
      key: "ai-key",
      type: "string",
      default: "xxx",
      title: "ai-key",
      description: "大模型的key",
    },
    {
      key: "template",
      type: "string",
      default: `## 暴露公网IP
#[[公网ip]]

### 方法一
使用如下网站
https://dashboard.cpolar.com/login

### 方法二
如果有公网ip的机器
使用隧道，可以参考 #[[ssh 隧道]]

上面是我的一份日志，#[[公网ip]]是有关这份日志总结后提取出来的名词标签。现在你的任务是把总结下面的日志，并提取最多三个名词标签。标签的形式是#[[名词]]，多个标签用空格分隔。最后只输出文字，不要说明、不要解释。

\${content}

`,
      title: "提示词",
      description: "大模型的提示词模板",
    },
    {
      key: "isShow",
      type: "boolean",
      default: true,
      title: "欢迎提示",
      description: "是否显示欢迎提示",
    },
  ];
  logseq.useSettingsSchema(schema);

  logseq.Editor.registerSlashCommand("st", async () => {
    // 获取当前块
    const currentBlock = await logseq.Editor.getCurrentBlock();
    if (!currentBlock) {
      logseq.UI.showMsg("无法获取当前块", "error");
      return;
    }

    // 获取最近二级标题的block, 向父亲跳，如果不能定位则使用null
    var iterSubTitleBlock: BlockEntity | null = currentBlock;
    while (
      iterSubTitleBlock !== null &&
      iterSubTitleBlock !== undefined &&
      iterSubTitleBlock.parent.id !== iterSubTitleBlock.page.id
    ) {
      iterSubTitleBlock = await logseq.Editor.getBlock(
        iterSubTitleBlock.parent?.id
      );
    }

    // 获取最近二级标题的block, 向兄弟跳, 如果不能定位则使用null
    while (iterSubTitleBlock !== null && iterSubTitleBlock !== undefined) {
      const blockContent = iterSubTitleBlock?.content?.trim();
      if (blockContent?.startsWith("## ")) {
        break;
      }
      iterSubTitleBlock =
        (await logseq.Editor.getPreviousSiblingBlock(iterSubTitleBlock.uuid)) ||
        null;
    }

    if (iterSubTitleBlock === null) {
      logseq.UI.showMsg("无法获取二级标题", "warning");
      return;
    }

    // 获取二级标题下的所有的内容
    let subContent = "";
    var iterSubTitleBlock: BlockEntity | null = iterSubTitleBlock;
    const rootBlock = await logseq.Editor.getBlock(iterSubTitleBlock.uuid, {
      includeChildren: true,
    });
    subContent += getContentFromBlockTree(rootBlock);
    subContent += "\n";
    iterSubTitleBlock =
      (await logseq.Editor.getNextSiblingBlock(iterSubTitleBlock.uuid)) || null;
    while (iterSubTitleBlock !== null && iterSubTitleBlock !== undefined) {
      try {
        const sContent = iterSubTitleBlock?.content?.trim();
        if (sContent?.startsWith("## ") || sContent?.startsWith("# ")) {
          break;
        }
        const rootBlock = await logseq.Editor.getBlock(iterSubTitleBlock.uuid, {
          includeChildren: true,
        });
        subContent += getContentFromBlockTree(rootBlock);
        subContent += "\n";

        iterSubTitleBlock =
          (await logseq.Editor.getNextSiblingBlock(iterSubTitleBlock.uuid)) ||
          null;
      } catch (e) {
        logseq.UI.showMsg(e.message, "error");
        break;
      }
    }

    // 输出二级标题下的所有内容

    // 获取配置项的值
    const aiAddress = logseq.settings["ai-address"];
    const aiEndpoint = logseq.settings["ai-endpoint"];
    const aiKey = logseq.settings["ai-key"];
    const template = logseq.settings["template"];

    // chat with AI
    if (!subContent || subContent.length <= 0) {
      logseq.UI.showMsg("无法获取二级标题下的内容", "error");
      return;
    }
    const llmResponseStr = await queryAi(
      template,
      { name: "jialtang", content: subContent },
      aiAddress + aiEndpoint,
      aiKey
    );

    if (!llmResponseStr) {
      logseq.UI.showMsg("无法获取大模型返回结果", "error");
      return;
    }
    const tagArr = extractTags(llmResponseStr);
    if (tagArr.length <= 0) {
      logseq.UI.showMsg("无法提取标签", "error");
      return;
    }
    const tagStr = tagArr.join(" ");
    await logseq.Editor.insertAtEditingCursor(tagStr);
  });

  logseq.Editor.registerSlashCommand("juzi", async () => {
    await logseq.Editor.insertAtEditingCursor(
      `#+BEGIN_QUOTE
        ${statement}
        #+END_QUOTE`
    );
    getStatement();
  });

  logseq.provideModel({
    msg(e: any) {
      const { msg } = e.dataset;
    },
  });

  logseq.provideStyle(`
    .hello {
       border: 1px solid var(--ls-border-color); 
       white-space: initial; 
       padding: 2px 4px; 
       border-radius: 4px; 
       user-select: none;
       cursor: default;
       display: flex;
       align-content: center;
    }`);

  logseq.provideModel({
    async update(e: any) {
      const { blockUuid } = e.dataset;
      const block = await logseq.Editor.getBlock(blockUuid);
      let newContent = block?.content;
      if (block?.content !== undefined && block?.content?.indexOf("red") > -1) {
        newContent = block?.content?.replace(`red`, `green`);
      } else {
        newContent = block?.content?.replace(`green`, `red`);
      }
      if (newContent === undefined) return;
      await logseq.Editor.updateBlock(blockUuid, newContent);
    },
  });

  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type, name, color] = payload.arguments;
    if (type !== ":hello") return;
    // 唯一 key
    const uniqueKey = `hello-${payload.uuid}`;

    logseq.provideUI({
      key: uniqueKey,
      reset: true,
      slot,
      template: `
      <div style="background-color: ${color}" class="hello"
      data-block-uuid="${payload.uuid}"
      >
        hello! ${name} and color is ${color}
      </div>
      `,
    });
  });
}

logseq.ready(main).catch(console.error);
