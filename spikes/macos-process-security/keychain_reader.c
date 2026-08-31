#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef READER_VARIANT
#define READER_VARIANT 0
#endif

static void print_status(const char *operation, OSStatus status) {
    CFStringRef message = SecCopyErrorMessageString(status, NULL);
    char buffer[256] = {0};

    if (message != NULL && CFStringGetCString(message, buffer, sizeof(buffer), kCFStringEncodingUTF8)) {
        fprintf(stderr, "%s_failed status=%d message=%s variant=%d\n", operation, (int)status, buffer,
                READER_VARIANT);
    } else {
        fprintf(stderr, "%s_failed status=%d variant=%d\n", operation, (int)status, READER_VARIANT);
    }

    if (message != NULL) {
        CFRelease(message);
    }
}

int main(int argc, char **argv) {
    if (argc != 4) {
        fprintf(stderr, "usage: %s <keychain-path> <service> <account>\n", argv[0]);
        return 64;
    }

    OSStatus status = SecKeychainSetUserInteractionAllowed(false);
    if (status != errSecSuccess) {
        print_status("disable_interaction", status);
        return 65;
    }

    SecKeychainRef keychain = NULL;
    status = SecKeychainOpen(argv[1], &keychain);
    if (status != errSecSuccess) {
        print_status("open", status);
        return 66;
    }

    UInt32 password_length = 0;
    void *password_data = NULL;
    SecKeychainItemRef item = NULL;
    status = SecKeychainFindGenericPassword(
        keychain,
        (UInt32)strlen(argv[2]), argv[2],
        (UInt32)strlen(argv[3]), argv[3],
        &password_length, &password_data, &item
    );

    if (status != errSecSuccess) {
        print_status("read", status);
        CFRelease(keychain);
        return 67;
    }

    printf("read_ok bytes=%u variant=%d\n", (unsigned int)password_length, READER_VARIANT);

    if (password_data != NULL) {
        SecKeychainItemFreeContent(NULL, password_data);
    }
    if (item != NULL) {
        CFRelease(item);
    }
    CFRelease(keychain);
    return 0;
}
