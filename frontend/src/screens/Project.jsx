import React, { useEffect, useState, useContext, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../config/axios";
import {
  initializeSocket,
  receiveMessage,
  sendMessage,
} from "../config/socket";
import { UserContext } from "../context/user.context";
import Markdown from "markdown-to-jsx";
import hljs from "highlight.js";
import { getWebContainer } from "../config/webContainer";

function SyntaxHighlightedCode(props) {
  const ref = useRef(null);

  React.useEffect(() => {
    if (ref.current && props.className?.includes("lang-") && window.hljs) {
      window.hljs.highlightElement(ref.current);

      // hljs won't reprocess the element unless this attribute is removed
      ref.current.removeAttribute("data-highlighted");
    }
  }, [props.className, props.children]);

  return <code {...props} ref={ref} />;
}

const Project = () => {
  const location = useLocation();

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState([]);
  const [users, setUsers] = useState([]);
  const [project, setProject] = useState(location.state.project);
  const [message, setMessage] = useState("");

  const [messages, setMessages] = useState([]);
  const [fileTree, setFileTree] = useState({});

  const [currentFile, setCurrentFile] = useState(null);
  const [openFiles, setOpenFiles] = useState([]);

  const [webContainer, setWebContainer] = useState(null);
  const [iframeUrl, setIframeUrl] = useState(null);
  const [runProcess, setRunProcess] = useState(null);

  const { user } = useContext(UserContext);

  const messageBox = useRef(null);

  const handleUserClick = (id) => {
    setSelectedUserId((prevSelectedUserId) => {
      const newSelectedUserId = new Set(prevSelectedUserId);
      if (newSelectedUserId.has(id)) {
        newSelectedUserId.delete(id);
      } else {
        newSelectedUserId.add(id);
      }

      return newSelectedUserId;
    });
  };

  const addCollaborators = () => {
    axios
      .put("/projects/add-user", {
        projectId: location.state.project._id,
        users: Array.from(selectedUserId),
      })
      .then((res) => {
        console.log(res.data);
        setIsModalOpen(false);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const send = () => {
    sendMessage("project-message", {
      message,
      sender: user,
    });

    setMessages((prevMessages) => [...prevMessages, { sender: user, message }]);

    setMessage("");
  };

  const renderContent = (content) => {
    if (typeof content === "string") {
      return <p>{content}</p>;
    } else if (Array.isArray(content)) {
      return (
        <ul className="list-disc pl-5">
          {content.map((item, index) => (
            <li key={index}>{renderContent(item)}</li>
          ))}
        </ul>
      );
    } else if (typeof content === "object" && content !== null) {
      return (
        <div className="mt-2">
          {Object.entries(content).map(([key, value], index) => (
            <div key={index} className="mb-2">
              <strong>{key.replace("_", " ").toUpperCase()}: </strong>
              {renderContent(value)}
            </div>
          ))}
        </div>
      );
    }
    return <p>Unsupported content type</p>;
  };

  const writeAiMessage = (message) => {
    let messageObject;

    try {
      messageObject = JSON.parse(message);
    } catch (error) {
      // If parsing fails, assume it's plain text
      return <p>{message}</p>;
    }

    return (
      <div className="overflow-auto bg-slate-950 text-white rounded-sm p-2">
        {renderContent(messageObject)}
      </div>
    );
  };

  useEffect(() => {
    initializeSocket(project._id);

    if (!webContainer) {
      getWebContainer().then((container) => {
        setWebContainer(container);
        console.log("container started");
      });
    }

    receiveMessage("project-message", (data) => {
      if (data.sender._id == "ai") {
        const message = JSON.parse(data.message);

        console.log(message);

        webContainer?.mount(message.fileTree);

        if (message.fileTree) {
          setFileTree(message.fileTree || {});
          saveFileTree(message.fileTree);
        }
        setMessages((prevMessages) => [...prevMessages, data]);
      } else {
        setMessages((prevMessages) => [...prevMessages, data]);
      }
    });

    axios
      .get(`/projects/get-project/${location.state.project._id}`)
      .then((res) => {
        setProject(res.data.project);
        setFileTree(res.data.project.fileTree || {});
      });

    axios
      .get("/users/all")
      .then((res) => {
        setUsers(res.data.users);
      })
      .catch((err) => {
        console.log(err);
      });
  }, []);

  function saveFileTree(ft) {
    console.log("Saving file tree:", ft);
    axios
      .put("/projects/update-file-tree", {
        projectId: project._id,
        fileTree: ft,
      })
      .then((res) => {
        console.log(res.data);
      })
      .catch((err) => {
        console.log("Error saving file tree:", err);
      });
  }

  const clearFileTree = () => {
    // Stop the running webContainer process if it exists at all
    if (runProcess) {
      runProcess.kill();
      setRunProcess(null);
      console.log("WebContainer process stopped");
    }

    //clear the file tree and reset related states
    setFileTree({});
    setCurrentFile(null);
    setOpenFiles([]);

    //close the webContainer window
    setIframeUrl(null);

    axios
      .put("/projects/update-file-tree", {
        projectId: project._id,
        fileTree: {},
      })
      .then((res) => {
        console.log("File tree cleared", res.data);
      })
      .catch((err) => {
        console.error("Error clearing file tree:", err);
      });
  };

  const scrollToBottom = () => {
    messageBox.current.scrollTop = messageBox.current.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <main className="h-screen w-screen flex">
      <section className="left relative flex flex-col h-screen min-w-96 bg-slate-300">
        <header className="flex justify-between items-center p-2 px-4 w-full bg-slate-100 absolute top-0 z-10">
          <button
            className="flex gap-2"
            onClick={() => {
              setIsModalOpen(true);
            }}
          >
            <i className="ri-add-fill mr-1"></i>
            <p>Add Collaborators</p>
          </button>

          <button
            onClick={clearFileTree}
            className="p-2 bg-red-500 text-white rounded-md font-medium"
          >
            clear code
          </button>

          <button
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            className="p-2"
          >
            <i className="ri-group-fill"></i>
          </button>
        </header>

        <div className="conversation-area pt-14 pb-10 flex-grow flex flex-col h-full relative">
          <div
            ref={messageBox}
            className="message-box p-1 flex-grow flex flex-col gap-1 overflow-auto max-h-full"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`${
                  msg.sender._id === "ai" ? "max-w-80" : "max-w-52"
                } 
              ${msg.sender._id == user._id.toString() && "ml-auto"} 
              message flex flex-col p-2 bg-slate-50 w-fit rounded-md`}
              >
                <small className="opacity-65 text-xs">{msg.sender.email}</small>
                <div className="text-sm overflow-auto">
                  {msg.sender._id === "ai" ? (
                    writeAiMessage(msg.message)
                  ) : (
                    <p>{msg.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="inputField w-full flex absolute bottom-0">
            <input
              onChange={(e) => setMessage(e.target.value)}
              value={message}
              className="p-2 px-4 border-none outline-none flex-grow"
              type="text"
              placeholder="Enter message"
            />
            <button onClick={send} className="px-5 bg-slate-950 text-white">
              <i className="ri-send-plane-fill"></i>
            </button>
          </div>
        </div>

        <div
          className={`sidePanel w-full h-full flex flex-col gap-2 bg-slate-50 absolute transition-all duration-300 
            ${isSidePanelOpen ? "translate-x-0" : "-translate-x-full"} top-0`}
        >
          <header className="flex justify-between items-center px-4 p-2 w-full bg-slate-200">
            <h1 className="font-semibold text-lg">Collaborators</h1>

            <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}>
              <i className="ri-close-fill"></i>
            </button>
          </header>

          <div className="users flex flex-col gap-2">
            {project.users &&
              project.users.map((user, index) => {
                return (
                  <div
                    key={index}
                    className="user cursor-pointer hover:bg-slate-200 p-2 flex gap-2 items-center"
                  >
                    <div
                      className="aspect-square rounded-full w-fit h-fit flex items-center justify-center p-5 
                    text-white bg-slate-600"
                    >
                      <i className="ri-user-fill absolute"></i>
                    </div>

                    <h1 className="font-semibold text-lg">{user.email}</h1>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <section className="right bg-red-50 flex-grow h-full flex">
        <div className="explorer h-full max-w-64 min-w-52 bg-slate-200">
          <div className="file-tree w-full">
            {fileTree &&
              Object.keys(fileTree).map((file, index) => (
                <button
                  key={index}
                  className="tree-element cursor-pointer p-2 px-4 flex items-center gap-2 bg-slate-300 w-full"
                  onClick={() => {
                    setCurrentFile(file);
                    setOpenFiles([...new Set([...openFiles, file])]);
                  }}
                >
                  <p className="font-semibold text-lg">{file}</p>
                </button>
              ))}
          </div>
        </div>

        <div className="code-editor flex flex-col flex-grow h-full">
          {Object.keys(fileTree).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-4 gap-8">
              <h3 className="text-black text-sm  font-medium">
                Give <span className="font-bold text-gray-600">AICA</span>{" "}
                prompts starting with{" "}
                <span className="text-xs font-bold text-blue-600">@ai</span> to
                interact with your personal ai agent
              </h3>
              <h3 className="text-black text-sm  font-medium">
                You can also run your{" "}
                <span className="text-xs font-bold text-blue-600">@ai</span>{" "}
                generated code in a virtual IDE just press run twice
              </h3>
              <h3 className="text-black text-sm  font-medium">
                Chat and interact with your team members. NOTE: Your AI
                responses would also be available to your projects members.
              </h3>
            </div>
          ) : (
            <div className="top flex justify-between w-full">
              <div className="files flex">
                {openFiles.map((file, index) => (
                  <button
                    key={index}
                    className={`open-file cursor-pointer p-2 px-4 flex items-center w-fit gap-2 bg-slate-300 
                    ${currentFile === file ? "bg-slate-400" : ""}`}
                    onClick={() => {
                      setCurrentFile(file);
                    }}
                  >
                    <p className="font-semibold text-lg">{file}</p>
                  </button>
                ))}
              </div>
              <div className="actions flex gap-2">
                <button
                  onClick={async () => {
                    await webContainer.mount(fileTree);

                    const installProcess = await webContainer?.spawn("npm", [
                      "install",
                    ]);

                    installProcess.output.pipeTo(
                      new WritableStream({
                        write(chunk) {
                          console.log(chunk);
                        },
                      })
                    );

                    if (runProcess) {
                      runProcess.kill();
                    }

                    let tempRunProcess = await webContainer?.spawn("npm", [
                      "start",
                    ]);

                    tempRunProcess.output.pipeTo(
                      new WritableStream({
                        write(chunk) {
                          console.log(chunk);
                        },
                      })
                    );

                    setRunProcess(tempRunProcess);

                    webContainer?.on("server-ready", (port, url) => {
                      console.log(port, url);
                      setIframeUrl(url);
                    });
                  }}
                  className="p-2 px-4 bg-slate-300 text-black font-semibold"
                >
                  run
                </button>
              </div>
            </div>
          )}

          <div className="bottom flex flex-grow">
            {fileTree[currentFile] && (
              <div className="code-editor-area h-full overflow-auto flex-grow bg-slate-50">
                <pre className="hljs h-full">
                  <code
                    className="hljs h-full outline-none"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const updatedContent = e.target.innerText;
                      const ft = {
                        ...fileTree,
                        [currentFile]: {
                          file: {
                            contents: updatedContent,
                          },
                        },
                      };
                      setFileTree(ft);
                      saveFileTree(ft);
                    }}
                    dangerouslySetInnerHTML={{
                      __html: hljs.highlight(
                        "javascript",
                        fileTree[currentFile].file.contents
                      ).value,
                    }}
                    style={{
                      whiteSpace: "pre-wrap",
                      paddingBottom: "25rem",
                      counterSet: "line-numbering",
                    }}
                  />
                </pre>
              </div>
            )}
          </div>
        </div>

        {iframeUrl && webContainer && (
          <div className="flex min-w-96 flex-col h-full">
            <div className="address-bar">
              <input
                type="text"
                onChange={(e) => setIframeUrl(e.target.value)}
                value={iframeUrl}
                className="w-full p-2 px-4 bg-slate-200"
              />
            </div>
            <iframe src={iframeUrl} className="w-full h-full"></iframe>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-md w-96 max-w-full relative">
            <header className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Select User</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2">
                <i className="ri-close-fill"></i>
              </button>
            </header>
            <div className="users-list flex flex-col gap-2 mb-16 max-h-96 overflow-auto">
              {users.map((user) => (
                <div
                  key={user._id}
                  className={`user cursor-pointer hover:bg-slate-200
                    ${
                      Array.from(selectedUserId).indexOf(user._id) != -1
                        ? "bg-slate-200"
                        : ""
                    } p-2 flex gap-2 items-center`}
                  onClick={() => handleUserClick(user._id)}
                >
                  <div
                    className="aspect-square relative rounded-full w-fit h-fit flex 
                                items-center justify-center p-5 text-white bg-slate-600"
                  >
                    <i className="ri-user-fill absolute"></i>
                  </div>
                  <h1 className="font-semibold text-lg">{user.email}</h1>
                </div>
              ))}
            </div>
            <button
              onClick={addCollaborators}
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 
                    bg-blue-600 text-white rounded-md"
            >
              Add Collaborators
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Project;
