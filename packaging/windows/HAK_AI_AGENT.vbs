' Starts HAK in the background (no console window) and opens the browser.
Dim fso, sh, here
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Environment("Process")("HAK_BACKGROUND") = "1"
rc = sh.Run("""" & here & "\runtime\node.exe"" scripts\launch.mjs", 0, True)
If rc <> 0 Then
  MsgBox "HAK không khởi động được. Xem nhật ký tại %LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER\logs\server.log", 48, "HAK AI Agent Control Center"
End If
