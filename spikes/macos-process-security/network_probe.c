#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static int run_server(const char *port_file) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("server_socket");
        return 70;
    }

    struct sockaddr_in address = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = htonl(INADDR_LOOPBACK),
        .sin_port = 0,
    };
    if (bind(fd, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(fd, 1) != 0) {
        perror("server_bind_or_listen");
        close(fd);
        return 71;
    }

    socklen_t address_length = sizeof(address);
    if (getsockname(fd, (struct sockaddr *)&address, &address_length) != 0) {
        perror("server_getsockname");
        close(fd);
        return 72;
    }

    FILE *file = fopen(port_file, "w");
    if (file == NULL) {
        perror("server_port_file");
        close(fd);
        return 73;
    }
    fprintf(file, "%u\n", (unsigned int)ntohs(address.sin_port));
    fclose(file);

    alarm(10);
    int client = accept(fd, NULL, NULL);
    if (client < 0) {
        perror("server_accept");
        close(fd);
        return 74;
    }
    close(client);
    close(fd);
    return 0;
}

static int run_client(const char *port_text) {
    char *end = NULL;
    long port = strtol(port_text, &end, 10);
    if (end == port_text || *end != '\0' || port < 1 || port > 65535) {
        fprintf(stderr, "invalid_port\n");
        return 64;
    }

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        fprintf(stderr, "client_socket_failed errno=%d message=%s\n", errno, strerror(errno));
        return 75;
    }

    struct sockaddr_in address = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = htonl(INADDR_LOOPBACK),
        .sin_port = htons((uint16_t)port),
    };
    if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0) {
        fprintf(stderr, "client_connect_failed errno=%d message=%s\n", errno, strerror(errno));
        close(fd);
        return 76;
    }

    close(fd);
    printf("connect_ok\n");
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 3 && strcmp(argv[1], "server") == 0) {
        return run_server(argv[2]);
    }
    if (argc == 3 && strcmp(argv[1], "client") == 0) {
        return run_client(argv[2]);
    }
    fprintf(stderr, "usage: %s server <port-file> | client <port>\n", argv[0]);
    return 64;
}
