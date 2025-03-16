#define UNICODE

#include <algorithm>
#include <cstdint>
#include <iostream>
#include <locale>
#include <shlobj.h>
#include <shlwapi.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <windows.h>

HWND hListView = NULL;
DWORD pid = 0;

extern "C" void setup()
{

    HWND hWorkerW = NULL;
    HWND hShellDLLDefView = NULL;

    do {
        hWorkerW = FindWindowEx(NULL, hWorkerW, L"WorkerW", NULL);
        hShellDLLDefView = FindWindowEx(hWorkerW, NULL, L"SHELLDLL_DefView", NULL);
    } while (hShellDLLDefView == NULL && hWorkerW != NULL);

    hListView = FindWindowEx(hShellDLLDefView, 0, L"SysListView32", L"FolderView");

    if (!hListView) {
        do {
            hWorkerW = FindWindowEx(NULL, hWorkerW, L"ProgMan", NULL);
            hShellDLLDefView = FindWindowEx(hWorkerW, NULL, L"SHELLDLL_DefView", NULL);
        } while (hShellDLLDefView == NULL && hWorkerW != NULL);
        hListView = FindWindowEx(hShellDLLDefView, 0, L"SysListView32", L"FolderView");
    }

    if (!hListView) {
        printf("COOKED");
        return;
    }
    GetWindowThreadProcessId(hListView, &pid);
}

extern "C" int32_t getIconCount()
{
    return ListView_GetItemCount(hListView);
}

extern "C" const char* getIconText(int32_t i)
{
    HANDLE hProcess = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE, FALSE, pid);
    if (!hProcess)
        return "";

    // Allocate memory in the remote process
    const int bufSize = 256;
    LPVOID remoteBuffer = VirtualAllocEx(hProcess, NULL, bufSize * sizeof(wchar_t), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!remoteBuffer) {
        CloseHandle(hProcess);
        return "";
    }

    LVITEMW lvItem = { 0 };
    lvItem.iSubItem = 0;
    lvItem.cchTextMax = bufSize;
    lvItem.pszText = (LPWSTR)remoteBuffer;

    // Allocate memory for LVITEM structure in the remote process
    LPVOID remoteLvItem = VirtualAllocEx(hProcess, NULL, sizeof(LVITEMW), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!remoteLvItem) {
        VirtualFreeEx(hProcess, remoteBuffer, 0, MEM_RELEASE);
        CloseHandle(hProcess);
        return "";
    }

    // Write LVITEM structure to remote process
    WriteProcessMemory(hProcess, remoteLvItem, &lvItem, sizeof(LVITEMW), NULL);

    // Send message to get text
    SendMessage(hListView, (0x1000 + 115), (WPARAM)i, (LPARAM)remoteLvItem);

    // Read back the text
    wchar_t buffer[bufSize] = { 0 };
    ReadProcessMemory(hProcess, remoteBuffer, buffer, bufSize * sizeof(wchar_t), NULL);

    // Cleanup
    VirtualFreeEx(hProcess, remoteLvItem, 0, MEM_RELEASE);
    VirtualFreeEx(hProcess, remoteBuffer, 0, MEM_RELEASE);
    CloseHandle(hProcess);

    char cstr[bufSize] = { 0 };
    for (int i = 0; i < bufSize; i++)
        cstr[i] = (char)buffer[i];

    return cstr;
}

POINT getIconPos(int32_t i)
{

    HANDLE hProcess = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ, FALSE, pid);
    LPPOINT pt = (LPPOINT)VirtualAllocEx(hProcess, NULL, sizeof(POINT), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    POINT iconPos;
    SIZE_T numRead;
    ListView_GetItemPosition(hListView, i, pt);
    ReadProcessMemory(hProcess, pt, &iconPos, sizeof(POINT), &numRead);

    VirtualFreeEx(hProcess, pt, 0, MEM_RELEASE);

    CloseHandle(hProcess);
    return iconPos;
}

extern "C" int32_t getIconX(int32_t i)
{

    return getIconPos(i).x;
}

extern "C" int32_t getIndex(char* t)
{
    printf("cache miss\n");
    for (int i = 0; i < getIconCount(); i++) {
        const char* name = getIconText(i);
        if (strcmp(name, t) == 0)
            return i;
    }
    return -1;
}

extern "C" int32_t getIconY(int32_t i)
{

    return getIconPos(i).y;
}
extern "C" void setIconPos(int32_t i, int32_t x, int32_t y)
{
    ListView_SetItemPosition(hListView, i, x, y);
}
extern "C" void refreshFolder(char* path)
{
    SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATH, path, NULL);
    PathMakeSystemFolderA(path);
}
extern "C" void setBackground(char* path)
{
    SystemParametersInfoA(SPI_SETDESKWALLPAPER, 0, (void*)path, SPIF_SENDCHANGE);
}
extern "C" void refreshDesktop()
{
    SHChangeNotify(0x8000000, 0x1000, 0, 0);
}

int main()
{
    setup();
    return 0;
}